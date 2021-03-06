import express from 'express';
import getBearerToken from 'get-twitter-bearer-token';
import { readFileSync } from 'fs';
import { Conf } from './conf';
import Twitter from 'twitter';
import wget from 'node-wget-promise';
import { MediaProcessorPlugin } from './plugins/plugin.interface';
import { AudioEventPlugin } from './plugins/audio-event';
import http from 'http';
import https from 'https';

const config: Conf = JSON.parse(readFileSync('./conf/conf.json', { encoding: 'utf-8' }));
const privateKey  = readFileSync(config.certificate.keyPath, 'utf8');
const certificate = readFileSync(config.certificate.certPath, 'utf8');
const credentials = {key: privateKey, cert: certificate};
let client: Twitter;
const plugins: MediaProcessorPlugin[] = [];

plugins.push(new AudioEventPlugin(config.audioDetectMessage));

getBearerToken(config.apiKey, config.apiSecret, (err, res) => {
  if (err) {
    // handle error
  } else {
    // bearer token
    client = new Twitter({
      consumer_key: config.apiKey,
      consumer_secret: config.apiSecret,
      bearer_token: res.body.access_token
    });
  }
})

function downloadAndProcessVideo(url: string, res: express.Response<any>): void {
  const fileNameWithHash = url.substring(url.lastIndexOf('/') + 1);
  const fileName = fileNameWithHash.substring(0, fileNameWithHash.indexOf('?'));
  wget(url).then(value => {
    let resultArr: string[] = [];
    let promiseArr: Promise<void>[] = [];
    for(const plugin of plugins) {
      // For all plugins we run detection and we push elements if necessary
      const promise = plugin.getDetection(fileName).then(result => {
        if (result) {
          resultArr.push(plugin.message);
        }
      });
      promiseArr.push(promise);
    }
    // Once all have finished we send the result
    Promise.all(promiseArr).then(() => res.send(resultArr));
  });
}

const app = express();
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

app.get('/tweet/:id', function (req, res) {
  client.get('statuses/show/' + req.params.id, (error, data, response) => {
    if (error) {
      
    } else {
      if (data.extended_entities && data.extended_entities && data.extended_entities.media && data.extended_entities.media.length > 0) {
        const firstMedia = data.extended_entities.media[0];
        if (firstMedia.type === 'video') {
          const url: string = (firstMedia.video_info.variants as any[]).sort((a, b) => a.bitrate - b.bitrate).pop().url;
          downloadAndProcessVideo(url, res);
        }
      }
    }
  });
});

app.get('/url/:url', function (req, res) {
  downloadAndProcessVideo(req.params.url, res);
});

httpServer.listen(80);
httpsServer.listen(443);
