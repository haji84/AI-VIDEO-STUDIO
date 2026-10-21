import io
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from .r2_run import prepare_inputs,config_from_env
from engine.run_manifest import ManifestError
class Store:
    def __init__(self, data):self.data=data
    def download_fileobj(self,bucket,key,dst):dst.write(self.data[key])
class TestCloudDataBoundary(unittest.TestCase):
    def test_no_implicit_cloud_credentials(self):
        before={k:os.environ.pop(k,None) for k in ('AIVS_PRIVATE_API_URL','AIVS_WORKER_TOKEN','AIVS_JOB_ID','R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY')}
        try:
            with self.assertRaises(ManifestError):config_from_env()
        finally:
            for k,v in before.items():
                if v is not None:os.environ[k]=v
    def test_exact_project_object_boundary(self):
        pid='proj_'+uuid.uuid4().hex
        asset='asset_'+uuid.uuid4().hex
        key=f'owner_preview/{pid}/{asset}/sample.mp4'
        source={'assetId':asset,'objectKey':key,'filename':'sample.mp4','bytes':6}
        with tempfile.TemporaryDirectory() as td:
            result=prepare_inputs({'projectId':pid,'sources':[source]},Store({key:b'fake00'}),'private-bucket',Path(td))
            self.assertEqual(Path(result['sources'][0]['path']).stat().st_size,6)
            bad={'projectId':pid,'sources':[{**source,'objectKey':f'owner_preview/other/{asset}/sample.mp4'}]}
            with self.assertRaises(ManifestError):prepare_inputs(bad,Store({key:b'fake00'}),'private-bucket',Path(td))
