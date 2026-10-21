import copy
import hashlib
import json
import math
import os
import random
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

from studio import core


class AudioSyncTest(unittest.TestCase):
    def test_fft_lag_with_realistic_nonidentical_lengths(self):
        rng=random.Random(8)
        base=[rng.random()*0.07 for _ in range(350)]
        for t in [25,51,89,135,183,232,271,313]:
            base[t]+=2.0
            base[t+1]+=0.8
        master=base[:240]
        other=[x*1.1+0.03 for x in base[31:270]]
        lag,score,uniqueness=core._correlate(master,other,max_shift=100,min_overlap=50)
        self.assertEqual(lag,31)
        self.assertGreater(score,0.8)
        self.assertGreater(uniqueness,0.2)

    def test_unmatched_signal_has_low_confidence(self):
        rng=random.Random(3)
        master=[rng.uniform(-1,1) for _ in range(250)]
        target=[rng.uniform(-1,1) for _ in range(250)]
        _,score,_=core._correlate(master,target,max_shift=35,min_overlap=100)
        self.assertLess(score,0.4)


class ModelTest(unittest.TestCase):
    def test_multicam_generation_split_undo(self):
        p=core.new_project('3カメラ')
        for i,offset in enumerate((0,2.0,4.0)):
            p['sources'].append({'id':f'cam{i}', 'offset':offset,'duration':20.0,'name':f'cam{i}.mp4'})
        scenes=core.make_plan(p,5)
        self.assertTrue(len(scenes)>5)
        self.assertGreaterEqual({s['camera'] for s in scenes}.__len__(),2)
        core.validate_timeline(p)
        id0=p['timeline'][0]['id']
        count=len(p['timeline'])
        core.segment_action(p,id0,'split')
        self.assertEqual(len(p['timeline']),count+1)
        core.segment_action(p,id0,'delete')
        self.assertEqual(len(p['timeline']),count)
        self.assertGreater(core.timeline_duration(p),0)

    def test_bad_segment_rejected_and_original_retained(self):
        p=core.new_project()
        p['sources']=[{'id':'cam1','offset':0,'duration':10,'name':'c.mp4'}]
        core.make_plan(p,4)
        s=p['timeline'][0]
        before=copy.deepcopy(p)
        with self.assertRaises(core.StudioError):
            core.mutate_segment(p,s['id'],{'start':999})
        self.assertEqual(p,before)

    def test_project_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            p=core.new_project('テスト')
            path=Path(td)/'project.json'
            core.store_project(path,p)
            self.assertEqual(core.read_project(path)['name'],'テスト')


class IntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:cls.ffmpeg=core._which('ffmpeg')
        except core.StudioError:raise unittest.SkipTest('ffmpeg unavailable')
        cls.temp=tempfile.TemporaryDirectory()
        cls.folder=Path(cls.temp.name)
        cls.rate=8000
        duration=19
        rng=random.Random(135)
        events=[(rng.uniform(0.7,18.4),rng.randint(250,920),rng.uniform(0.3,0.9)) for _ in range(54)]
        base=[]
        for i in range(duration*cls.rate):
            t=i/cls.rate
            value=0.003*math.sin(t*143)
            for start,freq,amp in events:
                if start<=t<start+0.12:
                    value+=amp*math.sin(2*math.pi*freq*(t-start))
            base.append(max(-1,min(1,value)))
        cls.paths=[]
        for i,(offset,length,color) in enumerate(((0,12,'blue'),(2,11,'red'),(1,12,'green'))):
            wav=cls.folder/f'audio_{i}.wav'
            s=base[int(offset*cls.rate):int((offset+length)*cls.rate)]
            import array
            wavs=array.array('h',(int(round(v*16000)) for v in s))
            with wave.open(str(wav),'wb') as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(cls.rate);f.writeframes(wavs.tobytes())
            video=cls.folder/f'camera_{i}.mp4'
            cmd=[cls.ffmpeg,'-nostdin','-hide_banner','-v','error','-y','-f','lavfi','-i',f'color=c={color}:s=320x180:r=15:d={length}',
                 '-i',str(wav),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-shortest',str(video)]
            cp=subprocess.run(cmd,capture_output=True,text=True)
            if cp.returncode:raise RuntimeError(cp.stderr)
            cls.paths.append(video)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_end_to_end_two_cameras_auto_sync_and_export(self):
        p=core.new_project('2 cameras')
        core.add_sources(p,[str(self.paths[0]),str(self.paths[1])])
        hashes=[hashlib.sha256(x.read_bytes()).hexdigest() for x in self.paths[:2]]
        self.assertEqual(len(p['sources']),2)
        results=core.sync_sources(p,max_shift_seconds=8)
        print('sync 2-cam:',results)
        self.assertGreaterEqual(results['aligned'],2,results)
        self.assertAlmostEqual(p['sources'][1]['offset'],2.0,delta=0.21)
        core.make_plan(p,switch_seconds=5)
        self.assertTrue(any(x['layout']=='split' for x in p['timeline']))
        p['timeline'][0]['caption']='CAM 1'
        target=self.folder/'export_2.mp4'
        report=core.render_project(p,self.folder/'scratch',target,quality='review',gpu=False)
        self.assertTrue(report['technical_ok'],report)
        self.assertGreater(target.stat().st_size,1000)
        self.assertAlmostEqual(report['duration_seconds'],core.timeline_duration(p),delta=1.0)
        self.assertEqual([hashlib.sha256(x.read_bytes()).hexdigest() for x in self.paths[:2]],hashes)

    def test_three_cameras_and_saved_project(self):
        p=core.new_project('3 camera support')
        core.add_sources(p,[str(x) for x in self.paths])
        result=core.sync_sources(p,max_shift_seconds=8)
        print('sync 3-cam:',result)
        self.assertEqual(result['aligned'],3,result)
        self.assertAlmostEqual(p['sources'][2]['offset'],1.0,delta=0.21)
        core.make_plan(p,switch_seconds=5)
        projfile=self.folder/'project_saved.json'
        core.store_project(projfile,p)
        reopened=core.read_project(projfile)
        self.assertEqual(len(reopened['sources']),3)
        self.assertEqual(len(reopened['timeline']),len(p['timeline']))
        source_ids={s['camera'] for s in reopened['timeline']}
        self.assertEqual(source_ids,{s['id'] for s in reopened['sources']})


    def test_export_three_cameras_with_two_view_and_caption(self):
        p=core.new_project('multiple cameras export')
        core.add_sources(p,[str(x) for x in self.paths])
        core.sync_sources(p,max_shift_seconds=8)
        core.make_plan(p,switch_seconds=5)
        # A real 3-camera timeline is rendered, not merely generated in JSON.
        self.assertEqual({x['camera'] for x in p['timeline']},{s['id'] for s in p['sources']})
        self.assertTrue(any(x['layout']=='split' for x in p['timeline']))
        p['timeline'][2]['caption']='Checking procedure'
        out=self.folder/'export_3.mp4'
        result=core.render_project(p,self.folder/'scratch_3',out,quality='review',gpu=False)
        self.assertTrue(result['technical_ok'],result)
        self.assertGreater(out.stat().st_size,1000)

    def test_single_camera_without_audio_and_360_reframe(self):
        movie=self.folder/'synthetic_360.mp4'
        args=[self.ffmpeg,'-nostdin','-hide_banner','-v','error','-y',
              '-f','lavfi','-i','testsrc2=s=256x128:r=15:d=2',
              '-an','-c:v','libx264','-pix_fmt','yuv420p',str(movie)]
        result=subprocess.run(args,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        p=core.new_project('single camera')
        core.add_sources(p,[str(movie)])
        self.assertTrue(p['sources'][0]['maybe_360'])
        self.assertFalse(p['sources'][0]['has_audio'])
        p['sources'][0]['equirect']=True
        core.make_plan(p,4)
        dest=self.folder/'render_360.mp4'
        result=core.render_project(p,self.folder/'scratch_360',dest,quality='review',gpu=False)
        self.assertTrue(result['technical_ok'],result)
        self.assertEqual(result['width'],960)
        self.assertTrue(result['has_audio'])

    def test_http_api_local_ui_and_undo(self):
        import json as js
        import threading
        import urllib.request
        from http.server import ThreadingHTTPServer
        from studio import server
        workspace=self.folder/'http_workspace'
        ctx=server.Context(workspace)
        server.CTX=ctx
        http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=http.serve_forever,daemon=True)
        thread.start()
        root=f'http://127.0.0.1:{http.server_port}'
        def http_get(endpoint):
            with urllib.request.urlopen(root+endpoint,timeout=20) as r:
                return js.load(r)
        def http_post(endpoint,body):
            req=urllib.request.Request(root+endpoint,
                     data=js.dumps(body).encode('utf-8'),
                     headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=20) as r:
                return js.load(r)
        try:
            self.assertTrue(http_get('/api/status')['ok'])
            self.assertEqual(http_post('/api/add',{'paths':[str(self.paths[0])]} )['added'],1)
            self.assertGreater(http_post('/api/plan',{'seconds':4})['segments'],0)
            before=len(http_get('/api/status')['project']['timeline'])
            item=http_get('/api/status')['project']['timeline'][0]
            self.assertTrue(http_post('/api/segment/action',{'id':item['id'],'action':'split'})['ok'])
            self.assertEqual(len(http_get('/api/status')['project']['timeline']),before+1)
            self.assertTrue(http_post('/api/undo',{})['ok'])
            self.assertEqual(len(http_get('/api/status')['project']['timeline']),before)
            self.assertTrue(http_post('/api/redo',{})['ok'])
            self.assertEqual(len(http_get('/api/status')['project']['timeline']),before+1)
            # Verify endpoint creates a real frame, not just a metadata stub.
            src=http_get('/api/status')['project']['sources'][0]['id']
            with urllib.request.urlopen(root+'/api/frame?id='+src+'&t=0',timeout=20) as r:
                self.assertEqual(r.headers.get_content_type(),'image/jpeg')
                self.assertGreater(len(r.read()),1000)
        finally:
            http.shutdown();http.server_close();server.CTX=None

if __name__=='__main__':unittest.main(verbosity=2)
