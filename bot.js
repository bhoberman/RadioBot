var fs = require('fs');
var mumble = require('mumble');
var sql = require('sqlite3');
var sys = require('sys');
var exec = require('child_process').exec;
var wav = require('wav');
var lame = require('lame');
var ffmpeg = require('fluent-ffmpeg');

if (process.argv.length != 5) {
    console.log("Usage: node bot.js serverURL channelName userName");
    process.exit(1);
}

var properties = {
    keyOptions: {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('crt.pem')
    },
    serverURL: process.argv[2],
    channelName: process.argv[3],
    userName: process.argv[4]
}

console.log('Connecting to mumble...');

var volume = 0.25;
var currentStream;

var playing = false;
var currentlyStreaming = false;

//argv[0] is node, argv[1] is the filename
mumble.connect(properties.serverURL, properties.keyOptions, function (error, connection) {
    if (error) {
        throw new Error(error);
    }

    console.log('Successfully connected to mumble...');
    connection.authenticate('radiobot');
    connection.on('initialized', function () {
        onInit(connection);
    });
    connection.on('message', function (message, actor) { //Set up callback for messages
        onMessage(connection, message, actor);
    });
});

function onInit(connection) {
    console.log('Connection initialized...');


    //Attempt to connect to specified channel with timeout for loading
    setTimeout(function () {
        var channel = connection.channelByName(properties.channelName);
        if (channel) {
            console.log("Autoconnect channel found.");
            channel.join();
        } else {
            console.log("Unable to join channel \"" + properties.channelName + ".\"");
        }
    }, 100);
};

function onMessage(connection, message, actor) {
    //Don't respond to yourself
    if (actor.name === properties.userName) {
        return;
    }

    //Ignore message if it doesn't start with "!"
    if (message.indexOf("!") !== 0) {
        return;
    }

    //Take away all html elements (mumble supports html for formatting) - from this:
    //http://stackoverflow.com/questions/17164335/how-to-remove-only-html-tags-in-a-string-using-javascript
    var messageText = message.replace(/<\/?(a|p|i|b|br)\b[^<>]*>/g, '');
    var cutPos = messageText.indexOf(' ');
    if (cutPos === -1) {
        cutPos = messageText.length;
    }
    var command = messageText.slice(1, cutPos);
    var argument = messageText.slice(cutPos + 1);

    performCommand(connection, command, argument, actor);

};

function playSound(connection, sound) {
    if (playing) {
        sendMessage(connection, "NO. Already playing a noise.");
        return;
    }
    console.log("Playing " + sound);
    var filename = sound;
    var input = fs.createReadStream(filename);
    var decoder = new lame.Decoder();
    decoder.on('format', onFormat);
    input.pipe(decoder);
    console.log("Playing " + filename);

    function onFormat(format) {
        console.log("MP3 format: %j", format);
        playing = decoder;
        currentlyStreaming = true;
        decoder.pipe(connection.inputStream({
            sampleRate: 44100,
            channels: 2,
            gain: volume
        }), function () {
            playing = false;
            currentlyStreaming = false;
        });
        //decoder.pipe(new Speaker);
    }
}

function pausePlaying(connection) {
    playing.unpipe();
    currentlyStreaming = false;
}

function stopPlaying(connection) {
    if (playing) {
        playing.unpipe();
    }
    playing = false;
    currentlyStreaming = false;
}

function resumePlaying(connection) {
    playing.pipe(connection.inputStream({
        sampleRate: 44100,
        channels: 2,
        gain: volume
    }, function () {
        playing = false;
        currentlyStreaming = false;
    }));
    currentlyStreaming = true;
}

function sendMessage(connection, message, actor) {
    //Send private message to actor, else channel
    if (actor) {
        actor.sendMessage(message);
    } else {
        if (connection.user) {
            connection.user.channel.sendMessage(message);
        }
    }
}

var commands = [{
    identifier: 'help',
    usagestring: '!help [optional: command]', 
    action: function (connection, argument, actor) {
        if (argument != '') {
            for (var i = 0; i < commands.length; i++) {
                if (commands[i].identifier == argument) {
                    sendMessage(connection, commands[i].usagestring);
                    return;
                }
            }
            sendMessage(connection, 'Command "' + argument + '" not found.');
        }
        var text = 'Here is a list of all commands:';
        for (var i = 0; i < commands.length; i++) {
            text += "<br>";
            text += commands[i].usagestring;
        }
        sendMessage(connection, text);
    }
}, {
    identifier: 'move',
    usagestring: '!move newChannelName',
    action: function (connection, argument, actor) {
        if (argument === 'root') {
            connection.rootChannel.join();
            console.log("Moved to Channel: root");
        } else {
            var channel = connection.channelByName(argument);
            if (channel) {
                channel.join();
                console.log("Moved to channel \"" + argument + "\"");
            } else {
                sendMessage(connection, 'Channel "' + argument + '" not found');
            }
        }
    }
}, {
    identifier: 'volume',
    usagestring: "!volume newVolume (float default 0.25)",
    action: function (connection, argument, actor) {
        if (playing !== false && currentlyStreaming === true) { //something is playing
            pausePlaying(connection);
            volume = parseFloat(argument);
            resumePlaying(connection);
        } else {
            volume = parseFloat(argument);
        }
    }
}, {
    identifier: 'add',
    usagestring: "!add songname;artistname;albumname;youtubeurl",
    action: function (connection, argument, actor) {
        var keyArray = argument.split(";");
        if (keyArray.length != 4) {
            sendMessage(connection, "Correct usage:<br>" + "!add songname;artistname;albumname;youtubeurl");
            return;
        }
        var name = keyArray[0];
        var artist = keyArray[1];
        var album = keyArray[2];
        var url = keyArray[3];
        if (!/https?:\/\/(www.)?youtube.com\/(.*)/g.test(url)) {
            sendMessage(connection, "Please include a valid youtube URL");
            return;
        }
        downloadVideo(name, artist, album, url, function () {
            sendMessage(connection, "Added " + name);
        });
    }
}, {
    identifier: 'list',
    usagestring: "!list",
    action: function (connection, argument, actor) {

        getDatabaseEntries(function (rows) {
            var message = "Here's what's in the library:<br>";
            for (var i = 0; i < rows.length; ++i) {
                var thisLine = String(i + 1) + ". " + rows[i].title + " by " + rows[i].artist + " in " + rows[i].album + (i == (rows.length - 1) ? "" : "<br>");
                message += thisLine;
            }
            sendMessage(connection, message);
        });
    }
}, {
    identifier: 'play',
    usagestring: "!play songID (obtained from !list)",
    action: function (connection, argument, actor) {
        var index = parseInt(argument);
        getFilename(index, function (file) {
            if (file) {
                console.log("Playing " + file);
                playSound(connection, file);
            } else {
                sendMessage(connection, "Error playing song #" + index);
            }

        });
    }
}, {
    identifier: 'pause',
    usagestring: "!pause",
    action: function (connection, argument, actor) {
        pausePlaying(connection);
    }
}, {
    identifier: 'resume',
    usagestring: "!resume",
    action: function (connection, argument, actor) {
        resumePlaying(connection);
    }
}, {
    identifier: 'stop',
    usagestring: "!stop",
    action: function (connection, argument, actor) {
        stopPlaying(connection);
    }
}];

function performCommand(connection, command, argument, actor) {

    //TODO: add ban list

    for (var i = 0; i < commands.length; ++i) {
        if (commands[i].identifier == command) {
            commands[i].action(connection, argument, actor);
            return;
        }
    }

    sendMessage(connection, "Command not found");

}

function downloadVideo(name, artist, album, url, callback) {
    var fileString = name + " - " + artist + " on " + album + ".m4a";
    child = exec("python downloader.py \"" + fileString + "\" " + url, function (error, stdout, stderr) {
        console.log("done downloading");
        console.log(stdout)
        console.log(error)
        console.log(stderr)
        callback();
    });

    addToDatabase(name, artist, album, fileString.replace('m4a', 'mp3'));
}

function addToDatabase(name, artist, album, filepath) {
    var db = new sql.Database('library.db');

    db.serialize(function () {
        db.run("CREATE TABLE IF NOT EXISTS songs (title TEXT, artist TEXT, album TEXT, file TEXT)");

        var stmt = db.prepare("INSERT INTO songs VALUES (?, ?, ?, ?)");
        stmt.run(name, artist, album, filepath);
        stmt.finalize();
    });

    db.close();
}

function getDatabaseEntries(callback) {
    var db = new sql.Database('library.db');
    var entries = [];
    db.serialize(function () {
        db.run("CREATE TABLE IF NOT EXISTS songs (title TEXT, artist TEXT, album TEXT, file TEXT)");

        db.each("SELECT * FROM songs", function (err, row) {
            entries.push(row);
        }, function () {
            ///Done
            callback(entries);
        });
    });

    db.close();
}

function getFilename(index, callback) {
    getDatabaseEntries(function (rows) {
        if (index > rows.length || index < 0) {
            return;
        }
        var file = rows[index - 1].file;
        callback(file);
    });
}

//scream.pipe(connection.inputStream());