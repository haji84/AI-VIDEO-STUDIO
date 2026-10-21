// Local UI/API integration preview. Memory-backed FakeR2, no external resources.
// TEST ONLY: the example token is hard-coded in the test helper. DO NOT DEPLOY.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import worker from './src/worker.mjs';
import {fixture} from './tests/helpers.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const fx=fixture();
fx.env.ASSETS={async fetch(r){const path=new URL(r.url).pathname;
 if(!['/','/index.html'].includes(path))return new Response('Not found',{status:404});
 return new Response(readFileSync(join(here,'public','index.html')),{headers:{'content-type':'text/html; charset=utf-8'}});
}};
const port=Number(process.env.PORT||8890);
const server=createServer(async (req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const url=`http://127.0.0.1:${port}${req.url}`;
  const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await worker.fetch(request,fx.env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(port,'127.0.0.1',()=>{console.log(`AI VIDEO STUDIO mobile preview: http://127.0.0.1:${port}`);console.log('DEV_TOKEN=',fx.env.OWNER_TOKEN);});
