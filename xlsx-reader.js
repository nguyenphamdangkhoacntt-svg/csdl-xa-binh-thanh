'use strict';
const zlib=require('node:zlib');
function unzip(buffer){
 const end=Math.max(0,buffer.length-65557);let e=-1;
 for(let i=buffer.length-22;i>=end;i--)if(buffer.readUInt32LE(i)===0x06054b50){e=i;break}
 if(e<0)throw Error('Không phải tệp XLSX/ZIP hợp lệ');
 let count=buffer.readUInt16LE(e+10),ptr=buffer.readUInt32LE(e+16),files=new Map();
 if(count>2000)throw Error('Tệp XLSX có quá nhiều thành phần');
 for(let i=0;i<count;i++){
  if(buffer.readUInt32LE(ptr)!==0x02014b50)throw Error('ZIP lỗi danh mục');
  let method=buffer.readUInt16LE(ptr+10),compressed=buffer.readUInt32LE(ptr+20),uncompressed=buffer.readUInt32LE(ptr+24),nl=buffer.readUInt16LE(ptr+28),el=buffer.readUInt16LE(ptr+30),cl=buffer.readUInt16LE(ptr+32),local=buffer.readUInt32LE(ptr+42),name=buffer.toString('utf8',ptr+46,ptr+46+nl);
  if(name.startsWith('xl/')&&['xl/sharedStrings.xml','xl/worksheets/sheet1.xml'].includes(name)){
   if(uncompressed>12e6)throw Error('Thành phần XLSX quá lớn');
   let pos=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
   let b=buffer.subarray(pos,pos+compressed);let out=method===8?zlib.inflateRawSync(b):method===0?b:null;
   if(!out||out.length!==uncompressed)throw Error('Lỗi giải nén XLSX');files.set(name,out.toString('utf8'));
  }
  ptr+=46+nl+el+cl;
 }
 return files;
}
function decode(s){return (s||'').replace(/&#(x[0-9a-f]+|\d+);|&(?:amp|lt|gt|quot|apos);/gi,m=>{let dict={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(dict[m])return dict[m];let n=m.slice(2,-1);return String.fromCodePoint(parseInt(n[0]==='x'?n.slice(1):n,n[0]==='x'?16:10))})}
function texts(xml){let a=[],r=/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g,m;while((m=r.exec(xml)))a.push(decode(m[1]||''));return a.join('')}
function readXlsx(buffer){let files=unzip(buffer);let sheet=files.get('xl/worksheets/sheet1.xml');if(!sheet)throw Error('Không tìm thấy sheet 1 của file Excel');let shared=[],m,ss=files.get('xl/sharedStrings.xml')||'',sr=/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;while((m=sr.exec(ss)))shared.push(texts(m[1]));
 let rows=[],rr=/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
 while((m=rr.exec(sheet))){let r=[],cell=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,cm;
  while((cm=cell.exec(m[2]))){let attrs=cm[1],addr=(attrs.match(/\br="([A-Z]+)\d+"/)||[])[1],typ=(attrs.match(/\bt="([^"]+)"/)||[])[1];if(!addr)continue;
   let col=0;for(let c of addr)col=col*26+c.charCodeAt(0)-64;col--;
   if(col>5)continue;
   let raw=(cm[2]||'').match(/<v>([\s\S]*?)<\/v>/),v=raw?decode(raw[1]):'';
   if(typ==='s')v=shared[Number(v)]??'';else if(typ==='inlineStr')v=texts(cm[2]||'');else if(typ==='n'||(!typ&&v!==''))v=Number(v);
   r[col]=v;
  }
  rows.push(r);
 }
 return rows;
}
function parseQuantity(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;let s=String(v).trim();if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replaceAll('.','');if(/^\d{1,3}(,\d{3})+$/.test(s))s=s.replaceAll(',','');return /^-?\d+(?:[.,]\d+)?$/.test(s)?Number(s.replace(',','.')):null}
function excelDate(v){if(v===null||v===undefined||v==='')return '';if(typeof v==='number'&&v>20000&&v<100000){let d=new Date(Date.UTC(1899,11,30)+Math.round(v*86400000));let p=n=>String(n).padStart(2,'0');return `${p(d.getUTCDate())}/${p(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;}return String(v).trim()}
function parseStats(buffer){let rows=readXlsx(buffer);let header=rows.findIndex(r=>String(r[0]||'').trim().toUpperCase()==='STT'&&String(r[1]||'').trim().toLowerCase().includes('dữ liệu'));if(header<0)throw Error('Thiếu tiêu đề STT / Dữ liệu trong file Excel');let items=new Map(),duplicates=[];
 for(let r of rows.slice(header+1)){let code=String(r[0]??'').trim();if(!/^\d+(\.\d+)*$/.test(code))continue;if(items.has(code))duplicates.push(code);items.set(code,{code,name:String(r[1]??'').trim(),quantity:parseQuantity(r[2]),updated:excelDate(r[3])})}
 if(duplicates.length)throw Error('Mã STT trùng: '+duplicates.join(', '));if(items.size<100)throw Error('File chỉ có '+items.size+' mã STT. Không import để tránh nhầm mẫu');let date='';for(let r of rows.slice(0,12))for(let c of r)if(typeof c==='string'&&c.includes('Ngày báo cáo:'))date=c.split('Ngày báo cáo:')[1].trim();return {items:[...items.values()],reportDate:date||'Chưa xác định',total:items.size};}
module.exports={readXlsx,parseStats};
