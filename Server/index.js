const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core'); // https://github.com/fent/node-ytdl-core
const express = require("express");
var myffmpeg = require('fluent-ffmpeg');


// https://www.youtube.com/watch?v=ECCWM6MUe0o

const directory = __dirname + "/public";
fs.readdir(directory, (err, files) => {
    if (err){
        throw err;
    }

    for (const FILE of files) {
        if(!FILE.endsWith('.md')){
            fs.unlink(path.join(directory, FILE), (err) => {
                if (err){
                    throw err;
                }
            });
        }
    }
});

const app = express ();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.use("/", express.static(directory));

app.get("/read", (request, response) => {
    if(request.query.url){
        const FILE_NAME = new Date().getTime();
        downloadVideo(FILE_NAME, request.query.url, () => {
            console.log("Video is downloaded");
            downloadAudio(FILE_NAME, request.query.url, () => {
                console.log("Audio is downloaded");
                mergeAudioAndVideo("./public/" + FILE_NAME + ".mp4", "./public/" + FILE_NAME + ".mp3", "./public/" + FILE_NAME + "_FINAL.mp4");
                console.log("Video and audio are merged");

                response.redirect('/' + FILE_NAME + ".mp4");
                /*
                setTimeout(() => {
                    fs.unlinkSync(PATH);
                }, infos.videoDetails.lengthSeconds * 2 * 1000);
                */
           });
        });
    }
    else{
        response.status(400).send("You must specify the video URL.");
    }
});

app.listen(PORT, () => {
    console.log("Server Listening on PORT:", PORT);
});

function mergeAudioAndVideo(video, audio, output) {
    myffmpeg()
        .addInput(video)
        .addInput(audio)
        .addOptions(['-map 0:v', '-map 1:a', '-c:v copy'])
        .format('mp4')
        .on('error', error => console.log(error))
        .on('end', () => {
            console.log(' finished !');
        })
        .saveToFile(output)
}

// Cette fonction télécharge la pardie audio.
function downloadAudio(file_name, url, callback){
    ytdl.getInfo(url).then((infos) => {
        const FILE_NAME = file_name + ".mp3";
        let my_format = ytdl.chooseFormat(infos.formats, { filter: "audioonly" });
        console.log(my_format);
        const PATH = "./public/" + FILE_NAME;
        ytdl(url, { filter: format => format.itag === my_format.itag }).pipe(fs.createWriteStream(PATH)).on('finish', function () {
            callback();
        });
    }, (error) => {
        console.error(error);
    });
}

// Cette fonction télécharge la pardie vidéo.
function downloadVideo(file_name, url, callback){
    ytdl.getInfo(url).then((infos) => {
        const FILE_NAME = file_name + ".mp4";
        let my_format = ytdl.chooseFormat(infos.formats, { quality: getMaxVideosByFPS(getMaxVideosByResolution(infos.formats.filter(x => x.hasVideo)))[0].itag + "" });
        const PATH = "./public/" + FILE_NAME;
        ytdl(url, { filter: format => format.itag === my_format.itag }).pipe(fs.createWriteStream(PATH)).on('finish', function () {
            callback();
        });
    }, (error) => {
        console.error(error);
    });
}

// Cette fonction retourne la liste des vidéos avec la plus haute résolution
function getMaxVideosByResolution(formats){
    let max = 0;
    formats.forEach(format => {
        if(format.height > max){
            max = format.height;
        }
    });
    return formats.filter(x => x.height == max);
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