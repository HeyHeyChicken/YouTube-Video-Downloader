const FS = require('fs');
const PATH = require('path');
const ytdl = require('ytdl-core'); // https://github.com/fent/node-ytdl-core
const express = require("express");
const https = require('https');
const { platform } = require('node:process');
const NODE_CMD = require("node-cmd");

const FFMPEG_ABSOLUTE_PATH = setFfmpegPath();
const SETTINGS = JSON.parse(FS.readFileSync(PATH.join(__dirname, "settings.json"), 'utf8'));

const directory = __dirname + "/public";
FS.readdir(directory, (err, files) => {
    if (err){
        throw err;
    }

    for (const FILE of files) {
        if(!FILE.endsWith('.md')){
            FS.unlink(PATH.join(directory, FILE), (err) => {
                if (err){
                    throw err;
                }
            });
        }
    }
});

const app = express ();
app.use(express.json());
const PORT = process.env.PORT || SETTINGS.port;

app.use("/", express.static(directory));

app.get("/read", (request, response) => {
    if(request.query.url){
        removeOldFiles();
        const STEP_1 = new Date().getTime();
        console.log("Downloading a new video...");
        console.log("[URL] " + request.query.url);
        downloadVideo(STEP_1, request.query.url, (VIDEO_PATH) => {
            const STEP_2 = new Date().getTime();
            console.log("Video is downloaded (" + ((STEP_2 - STEP_1) / 1000) + " s)");
            downloadAudio(STEP_1, request.query.url, (AUDIO_PATH, infos) => {
                const STEP_3 = new Date().getTime();
                console.log("Audio is downloaded (" + ((STEP_3 - STEP_2) / 1000) + " s)");
                const FINAL_FILE_PATH = "/" + STEP_1 + "_" + infos.videoDetails.lengthSeconds + "_FINAL.mp4";
                mergeAudioAndVideo(VIDEO_PATH, AUDIO_PATH, "./public" + FINAL_FILE_PATH, () => {
                    const STEP_4 = new Date().getTime();
                    console.log("Video and audio are merged (" + ((STEP_4 - STEP_3) / 1000) + " s)");
                    console.log("TOTAL = " + ((STEP_4 - STEP_1) / 1000) + " s");
                    response.redirect(FINAL_FILE_PATH);
                });
           });
        });
    }
    else{
        response.status(400).send("You must specify the video URL.");
    }
});

app.listen(PORT, () => {
    console.log("Server listening on port:", PORT);
});

function removeOldFiles() {
    const NOM = new Date().getTime();
    const DIRECTORY = __dirname + "/public";
    FS.readdir(DIRECTORY, (err, files) => {
        if (err){
            throw err;
        }

        for (const FILE of files) {
            if(!FILE.endsWith('.md')){
                if(FILE.endsWith('_FINAL.mp4')){
                    const SPLIT = FILE.split("_");
                    const ELLAPSED = (NOM - parseInt(SPLIT[0]) / 1000);
                    if(ELLAPSED >= parseInt(SPLIT[1]) * 2){
                        FS.unlink(PATH.join(DIRECTORY, FILE), (err) => {
                            if (err){
                                throw err;
                            }
                        });
                    }
                }
            }
        }
    });
}

function setFfmpegPath() {
    switch(platform){
        case "win32":
            return PATH.resolve(__dirname, "ffmpeg", "windows", "bin", "ffmpeg.exe");
        case "aix":
        case "darwin":
        case "freebsd":
        case "linux":
        case "openbsd":
        case "sunos":
        case "android":
            return PATH.resolve(__dirname, "ffmpeg", "macos", "ffmpeg");
    }
    return "";
}

function mergeAudioAndVideo(video, audio, output, callback) {
    const CONVERT_COMMAND =   FFMPEG_ABSOLUTE_PATH + " -i " + video + " -i " + audio + " -c copy " + output;
    NODE_CMD.run(
        CONVERT_COMMAND,
        function(err, data, stderr){
            // ON SUPPRIME lES ANCIEN FICHIERS
            FS.unlink(video, function(){
                FS.unlink(audio, function(){
                    callback();
                });
            });
        }
    );
}

// Cette fonction télécharge la pardie audio.
function downloadAudio(file_name, url, callback){
    ytdl.getInfo(url).then((infos) => {
        const FILE_NAME = file_name + "_" + infos.videoDetails.lengthSeconds + ".mp3";
        let formats = infos.formats.filter(x => x.hasAudio && !x.hasVideo);
        if(formats.some((format) => format.displayName)){
            formats = formats.filter(x => x.audioTrack.displayName.includes(SETTINGS.language));
        }
        formats = getMinAudiosBitrate(formats);
        const PATH = "./public/" + FILE_NAME;
        ytdl(url, { filter: format => format.url == formats[0].url }).pipe(FS.createWriteStream(PATH)).on('finish', function () {
            callback(PATH, infos);
        });
    }, (error) => {
        console.error(error);
    });
}

// Cette fonction télécharge la pardie vidéo.
function downloadVideo(file_name, url, callback){
    ytdl.getInfo(url).then((infos) => {
        console.log("[TITLE] " + infos.videoDetails.title);
        const FILE_NAME = file_name + "_" + infos.videoDetails.lengthSeconds + ".mp4";
        let my_format = getMaxVideosByFPS(getMinVideosBitrate(getMaxVideosByResolution(infos.formats.filter(x => x.hasVideo))))[0];
        const PATH = "./public/" + FILE_NAME;
        ytdl(url, { filter: format => format.url == my_format.url }).pipe(FS.createWriteStream(PATH)).on('finish', function () {
            callback(PATH);
        });
    }, (error) => {
        console.error(error);
    });
}

// Cette fonction retourne la liste des vidéos avec la plus haute résolution
function getMaxVideosByResolution(formats){
    let max = 0;
    formats.forEach(format => {
        if(format.height > max && format.height <= SETTINGS.maxResolution){
            max = format.height;
        }
    });
    const BACK = formats.filter(x => x.height == max);
    return BACK;
}

// Cette fonction retourne la liste des vidéos avec la plus haute résolution
function getMinVideosBitrate(formats){
    let min = formats[0].bitrate;
    formats.forEach(format => {
        if(format.bitrate < min){
            min = format.bitrate;
        }
    });
    const BACK = formats.filter(x => x.bitrate == min);
    return BACK;
}

// Cette fonction retourne la liste des vidéos avec le plus haut FPS
function getMaxVideosByFPS(formats){
    let max = 0;
    formats.forEach(format => {
        if(format.fps > max){
            max = format.fps;
        }
    });
    return formats.filter(x => x.fps == max);
}

// Cette fonction retourne la liste des vidéos avec la plus haute résolution
function getMinAudiosBitrate(formats){
    let min = formats[0].audioBitrate;
    formats.forEach(format => {
        if(format.audioBitrate < min){
            min = format.audioBitrate;
        }
    });
    const BACK = formats.filter(x => x.audioBitrate == min);
    return BACK;
}