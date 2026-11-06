/** Versioned, lossless transport only. In-memory diaries/backups retain the legacy JSON shape. */
const FORMAT='homegym-cloud-gzip';
const MAX_BYTES=64*1024*1024;
const hasProgram=data=>Object.values(data?.history?.years||{}).some(year=>
    year.mesocycles?.some(meso=>meso.program));

export async function encodeCloudPayload(data) {
    if(!hasProgram(data)||typeof CompressionStream!=='function')return data;
    const raw=new TextEncoder().encode(JSON.stringify(data));
    if(raw.length>MAX_BYTES)throw Error('Diario troppo grande per il formato cloud: conserva il backup locale.');
    const compressed=new Uint8Array(await new Response(new Blob([raw]).stream()
        .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let binary='';
    for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
    const packed={format:FORMAT,schemaVersion:1,encoding:'gzip-base64',uncompressedBytes:raw.length,data:btoa(binary)};
    return JSON.stringify(packed).length<raw.length?packed:data;
}

export async function decodeCloudPayload(payload) {
    if(payload?.format!==FORMAT)return payload;
    if(payload.schemaVersion!==1||payload.encoding!=='gzip-base64'||
        !Number.isInteger(payload.uncompressedBytes)||payload.uncompressedBytes<1||payload.uncompressedBytes>MAX_BYTES||
        typeof payload.data!=='string'||payload.data.length>MAX_BYTES)
        throw Error('Formato del diario cloud non valido o non supportato.');
    if(typeof DecompressionStream!=='function')throw Error('Aggiorna il browser per leggere questo diario compresso.');
    const bytes=Uint8Array.from(atob(payload.data),char=>char.charCodeAt(0));
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks=[];let size=0;
    try{
        while(true){
            const {done,value}=await reader.read();if(done)break;
            size+=value.length;
            if(size>payload.uncompressedBytes)throw Error('Dimensione del diario cloud non valida.');
            chunks.push(value);
        }
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
    if(size!==payload.uncompressedBytes)throw Error('Diario cloud incompleto.');
    const data=JSON.parse(await new Blob(chunks).text());
    if(!data?.history?.years || typeof data.history.years!=='object' || Array.isArray(data.history.years))
        throw Error('Diario cloud ricostruito non valido.');
    return data;
}
