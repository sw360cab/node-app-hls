const http = require("http");
const https = require("https");
const fs = require('fs');
const os = require('os');
const path = require('path');


const argUrl =  process.env["STREAMING_URL"] || process.argv[2];
const baseUri = argUrl || "http://34.253.170.217/vods3/_definst_/mp4:amazons3/net-cedeo-wimtv-transcoded-videos/7af994bc-c8db-4ffd-b988-939eb1a5414c-tr.mp4/playlist.m3u8?token=test";

const hostname = os.hostname();
try {
  fs.mkdirSync( "/tmp/logs" );
} catch (err) {
  if (err.code !== 'EEXIST') throw err
}

const fileName = ['/tmp/logs/', hostname, '_err_',
  new Date().toISOString().replace(/[\:\.]/g,"_"),'.log'].join('');
const errLog = fs.createWriteStream(fileName);
let loadedMedia = [];

const requestChunk = function requestUri(uri) {
  console.log("requesting", uri);
  https.get(uri, function(res){
    let len = 0;
    let duration = 0;
    let data = '';
    let currentStr;
    let matcher;

    res.on('data', function(chunk) {
      matcher = null;
      currentStr = chunk.toString('utf8');
      data += currentStr;
      len += chunk.length;

      if ( (matcher = currentStr.match(/^chunklist_.*$/gm)) != null ) {
        console.log("chunklist(s) found", matcher );
        matcher.forEach(function(item) {
          requestUri(uri.replace(/playlist.m3u8.*$/,item))
        });
      }
      else if ( (matcher = currentStr.match(/^media_.*$/gm)) != null ) {
        console.log("media(s) found", matcher );
        matcher.forEach(function(item, currentIndex) {
          if (loadedMedia.indexOf(item) < 0) {
            console.log("new media found", item);
            loadedMedia.push(item);
            requestMedia(baseUri.replace(/playlist.m3u8.*$/,item))
          }
          if (currentIndex == 0) { // first item
            // look for duration
            duration = parseInt(currentStr.match(/\#EXT-X-TARGETDURATION:(\d+)/m)[1]);
            console.log("scheduling next chunklist request in", duration * 1000);
            setTimeout(function(){
              requestUri(uri);
            }, duration*1000);
          }
        });
      }
    });
    res.on('end', function() {
      console.log("End chunklist request", len == data.length ? "OK":"KO");
      if (len != data.length) {
        errLog.write("- Error in chunklist\t\t -> Size" + len + " " + data.length + "\n");
      }
    });
    res.on('error', function(e) {
      console.log("Got error:", e.message);
      errLog.write("- Error in chunklist\t\t -> " + e.message + "\n");
    });
  }).on('error', function(e) {
    console.log("Got error in http chunklist:", e.message);
    errLog.write("- Error in HTTP chunklist\t\t -> " + e.message + "\n");
  });
}(baseUri);

const requestMedia = function(uri) {
  https.get(uri, function(res){
    let len = 0;
    let buf, tempBuf;
    let contentLength = Number.parseInt(res.headers['content-length']);

    res.on('data', function(chunk) {
      tempBuf = Buffer.from(chunk);
      len += chunk.length;
      buf = buf ? Buffer.concat([buf, tempBuf], len) : tempBuf;
    });
    res.on('end', function() {

      console.log("End Media Request",len, buf.length);
      console.log("Media size is", len == contentLength ? "OK":"KO") ;
      if (len != contentLength)
        errLog.write("- Error in media\t\t -> Size" + len + " " + contentLength + "\n");
    });
    res.on('error', function(e) {
      console.log("Got error in requesting media:", e.message);
      errLog.write("- Error in media\t\t -> " + e.message + "\n");
    });
  }).on('error', function(e) {
    console.log("Got error in http media:", e.message);
    errLog.write("- Error in HTTP media\t\t -> " + e.message + "\n");
  });
};
