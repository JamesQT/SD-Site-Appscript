/** Drive simulado: ningún archivo ni permiso real se crea durante las pruebas. */
function installDriveMock(ctx) {
  const files=new Map(),folders=new Map(),faults={share:0,description:0};let sequence=0;
  const iterator=items=>{let index=0;return {hasNext:()=>index<items.length,next:()=>items[index++]};};
  ctx.Utilities.base64Decode=value=>Array.from(Buffer.from(value,'base64'));
  ctx.Utilities.base64Encode=bytes=>Buffer.from(bytes.map(b=>(b+256)%256)).toString('base64');
  ctx.Utilities.newBlob=(bytes,mime,name)=>({getBytes:()=>[...bytes],mime,name});
  ctx.DriveApp={
    createFolder(name){
      const id='folder-'+(++sequence),folder={name,getId:()=>id,getFilesByName:name=>iterator(Array.from(files.values()).filter(f=>f.folder===id&&f.name===name)),createFile(blob){
        const fileId='file-'+(++sequence),file={folder:id,name:blob.name,blob,description:'',viewers:new Set(),getId:()=>fileId,getUrl:()=>`https://drive.google.com/file/d/${fileId}/view`,getBlob:()=>blob,getDescription(){return this.description;},setDescription(value){if(faults.description-->0)throw Error('Description unavailable');this.description=value;},addViewers(emails){if(faults.share-->0)throw Error('Drive sharing unavailable');emails.forEach(email=>this.viewers.add(email));}};
        files.set(fileId,file);return file;
      }};folders.set(id,folder);return folder;
    },
    getFolderById(id){if(!folders.has(id))throw Error('Folder unavailable');return folders.get(id);},
    getFileById(id){if(!files.has(id))throw Error('File unavailable');return files.get(id);}
  };
  return {files,folders,faults};
}
module.exports={installDriveMock};
