const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('vendored image dependency matches the module version and retains notices',()=>{
 const version=read('go.mod').match(/golang\.org\/x\/image\s+(v\S+)/)[1];
 assert(read('vendor/modules.txt').includes('# golang.org/x/image '+version+'\n'));
 for(const file of ['LICENSE','PATENTS','draw/draw.go','draw/scale.go','draw/impl.go','math/f64/f64.go']){
  assert(read('vendor/golang.org/x/image/'+file).length>0,file);
 }
});
test('Docker and server builds do not download Go dependencies',()=>{
 const docker=read('Dockerfile');
 assert.match(docker,/COPY vendor \.\/vendor/);
 assert.match(docker,/RUN --network=none go build -mod=vendor\b/);
 assert.doesNotMatch(docker,/RUN go mod download/);
 for(const script of ['deploy/release-deploy.sh','deploy/release-from-bundle.sh'])assert.match(read(script),/go build -mod=vendor\b/);
});
