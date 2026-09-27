
const http = require('http');
const fs = require('fs');
const path = require('path');
const {Storage} = require('@google-cloud/storage');

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.join(__dirname, '..', 'public');
const DATA_FILE = 'notebook.json';
const PREFIX = process.env.GCS_PREFIX || 'mistake-notebook';
const BUCKET_NAME = process.env.GCS_BUCKET || '';

let storage = null, bucket = null;
if (BUCKET_NAME) {
  storage = new Storage();
  bucket = storage.bucket(BUCKET_NAME);
}

function send(res,status,body,type='application/json'){
  res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store'});
  res.end(type==='application/json' ? JSON.stringify(body) : body);
}
function readBody(req){return new Promise((resolve,reject)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}
function publicFile(req,res){
  let p = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(p==='/'||p==='')p='/index.html';
  const file=path.normalize(path.join(ROOT,p));
  if(!file.startsWith(ROOT)){send(res,403,{error:'forbidden'});return}
  fs.readFile(file,(err,data)=>{
    if(err){send(res,404,{error:'not found'});return}
    const ext=path.extname(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});
    res.end(data);
  });
}
async function cloudGetJSON(){
  if(!bucket) return null;
  const file=bucket.file(`${PREFIX}/${DATA_FILE}`);
  const [exists]=await file.exists(); if(!exists)return null;
  const [data,meta]=await file.download();
  return {snapshot:JSON.parse(data.toString('utf8')),updatedAt:Number(meta.updated||0)};
}
async function main(req,res){
  try{
    if(req.url==='/api/health'){
      let cloud=false,updatedAt=0;
      if(bucket){try{const x=await cloudGetJSON();cloud=!!x;updatedAt=x?.updatedAt||0}catch{}}
      return send(res,200,{ok:true,server:true,cloudConfigured:!!bucket,cloudBackup:cloud,updatedAt});
    }
    if(req.method==='PUT' && req.url==='/api/sync/notebook'){
      if(!bucket)return send(res,503,{error:'GCS_BUCKET not configured'});
      const body=await readBody(req); const obj=JSON.parse(body.toString('utf8'));
      await bucket.file(`${PREFIX}/${DATA_FILE}`).save(JSON.stringify(obj),{contentType:'application/json',resumable:false,metadata:{cacheControl:'no-store'}});
      return send(res,200,{ok:true,updatedAt:obj.updatedAt||Date.now()});
    }
    if(req.method==='PUT' && req.url.startsWith('/api/sync/image/')){
      if(!bucket)return send(res,503,{error:'GCS_BUCKET not configured'});
      const id=decodeURIComponent(req.url.split('/').pop()); const body=await readBody(req);
      const type=req.headers['content-type']||'application/octet-stream';
      await bucket.file(`${PREFIX}/images/${id}.bin`).save(body,{contentType:type,resumable:false,metadata:{cacheControl:'private,max-age=31536000'}});
      return send(res,200,{ok:true});
    }
    if(req.method==='GET' && req.url==='/api/restore'){
      const x=await cloudGetJSON(); if(!x)return send(res,404,{error:'No cloud backup'});
      return send(res,200,x.snapshot);
    }
    if(req.method==='GET' && req.url.startsWith('/api/image/')){
      if(!bucket)return send(res,503,{error:'GCS_BUCKET not configured'});
      const id=decodeURIComponent(req.url.split('/').pop());
      const file=bucket.file(`${PREFIX}/images/${id}.bin`);
      const [exists]=await file.exists();if(!exists)return send(res,404,{error:'Image not found'});
      const [meta]=await file.getMetadata();res.writeHead(200,{'Content-Type':meta.contentType||'application/octet-stream','Cache-Control':'private,max-age=31536000'});
      file.createReadStream().pipe(res);return;
    }
    return publicFile(req,res);
  }catch(e){console.error(e);send(res,500,{error:e.message})}
}
http.createServer(main).listen(PORT,()=>console.log(`Mistake Notebook running at http://localhost:${PORT}`));
