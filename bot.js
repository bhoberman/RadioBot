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
     if(error) { throw new Error(error); }

     console.log('Successfully connected to mumble...');
     connection.authenticate('radiobot');
     connection.on('initialized', function() {
         onInit(connection);
     });
     connection.on('message', function(message, actor) {//Set up callback for messages
         onMessage(connection, message, actor);
     });
 });

function onInit (connection) {
    console.log('Connection initialized...');


    //Attempt to connect to specified channel, 
    setTimeout(function() {
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
    if (actor.name === 'radiobot') {
        //don't respond to yourself
        return;
    }

    //Ignore message if it doesn't start with "!"
    if (message.indexOf("!") !== 0)
        return;

    //Take away all html elements - from this:
    //http://stackoverflow.com/questions/17164335/how-to-remove-only-html-tags-in-a-string-using-javascript
    var messageText = message.replace(/<\/?(a|p|i|b|br)\b[^<>]*>/g, '');
    messageArray = messageText.split(' ');
    //for (var i = 0; i < messageArray.length; i++) {
//         //convert to lower case to make easier to parse
//         messageArray[i] = messageArray[i].toLowerCase();
//     };

    //ignore message if it doesn't meet certain criteria
    if (!messageArray || messageArray.length === 0
        || messageArray[0].length === 1 || messageArray[0].substring(0, 1) !== '!') return;

    //first word is the keyword (after the '!')
    var keyWord = messageArray[0].substring(1);
    if (messageArray.length > 0) {
        //take away command from beginning to make easier to parse
        messageText = messageText.substring(messageArray[0].length+1);
    }
    messageArray.shift(); //remove first element (e.g. '!hi')

    performCommand(connection, keyWord, messageText, messageArray, actor)

};

function playSound(connection, sound) {
    // scream.pipe(connection.inputStream());

    // scream = fs.readFileSync(sound);
    //scream = fs.createReadStream(sound);
    //scream.on('end', function() {
    //    scream.unpipe();
    //});
    //scream.pipe(connection.inputStream());
    //connection.inputStream();
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
        decoder.pipe(connection.inputStream({sampleRate: 44100, channels: 2, gain:volume}), function() {
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
    playing.pipe(connection.inputStream({sampleRate: 44100, channels: 2, gain:volume}, function() {
            playing = false;
            currentlyStreaming = false;
        }));
    currentlyStreaming = true;
}

function sendMessage(connection, message, actor) {
    //if you include a user, send it to him
    if (actor) {
        actor.sendMessage(message);
    } else {
        if (connection.user) {
            connection.user.channel.sendMessage(message);
        }
    }
}

var oneWordCommands = [
    ['hi', 'Hello!'],
    ['lenny', '( ͡° ͜ʖ ͡°)'],
    ['dong', 'ヽ༼ຈل͜ຈ༽ﾉ raise your dongers ヽ༼ຈل͜ຈ༽ﾉ'],
    ['hecomes', 'Ḫ̵͇Ẹ ̢̥̰̥̻̘̙̠C̺̙̠͠O̠̗M̺̭E̵S͖͓͜'],
    ['meh', '¯\\_(ツ)_/¯'],
    ['flipthetable', '(╯°□°）╯︵ ┻━┻'],
    ['putitdown', '┬─┬ノ( º _ ºノ) chill out bro']
];

var commands = [//{
//     identifier: 'doge',
//     minLength: 0, //how much additional information you need
//     action: function(connection) {
//         var words = ['amaze', 'wow', 'such mumble', 'so bot', 'such auto'];
//         sendMessage(connection, words[Math.floor(Math.random()*words.length)]);
//     }
// }, {
//     identifier: 'curse',
//     minLength: 1, //how much additional information you need
//     action: function(connection, keyString) {
//         sendMessage(connection, 'Screw you, ' + keyString + '!');
//     }
// }, 
{
    identifier: 'help',
    minLength: 1, //how much additional information you need
    action: function(connection, keyString, keyArray, actor) {
        sendMessage(connection, 'Here is a list of all commands:', actor);

        var text = '';
        for (var i = 0; i < commands.length; i++) {
            //don't want anyone else to know
            if (commands[i].identifier === 'scream'
                || commands[i].identifier === 'blackYeah') continue;

            text += commands[i].identifier + ', ';
        }

        for (var i = 0; i < oneWordCommands.length; i++) {
            text += oneWordCommands[i][0] + ', ';
        };

        sendMessage(connection, text);
    }
}, {
    identifier: 'move',
    minLength: 1, //how much additional information you need
    action: function(connection, keyString) {
        //get rest of command without '!move '
        var newChannel = keyString;
        if (newChannel === 'root') {
            connection.rootChannel.join();
            console.log("Moved to Channel: root");
        } else {
            var channel = connection.channelByName(newChannel);
            if (channel) {
                channel.join();
                console.log("Moved to Channel: " + newChannel);
            } else {
                sendMessage(connection, 'Channel ' + newChannel + ' not found');
            }
        }
    }
}, {
    identifier: 'printuserlist',
    minLength: 0, //how much additional information you need
    action: function(connection) {
        sendMessage(connection, "User List Requested");

        var users = connection.users();
        var text = "";

        for (var i = 0; i < users.length; i++) {
            text += users[i].name + ', ';
        }

        sendMessage(connection, text);
    }
}, {
    identifier: 'msg',
    minLength: 1, //how much additional information you need
    action: function(connection, keyString, keyArray, actor) {
        console.log("sending message to " + actor.name);
        sendMessage(connection, "Thanks for your request, " + actor.name, actor);
        sendMessage(connection, keyString);
    }
//, {
    // identifier: 'scream',
    // minLength: 0, //how much additional information you need
    // action: function(connection, keyString, keyArray) {

    //     playSound(connection, 'scream.wav');
    // }
//}, 
// {
//     identifier: 'blackyeah',
//     minLength: 0, //how much additional information you need
//     action: function(connection, keyString, keyArray) {
//         playSound(connection, 'blackYeah.wav');
//     }
},{
    identifier: 'volume',
    minLength: 1,
    action: function(connection, keyString, keyArray) {
        if (playing !== false && currentlyStreaming === true) { //something is playing
            pausePlaying(connection);
            volume = parseFloat(keyArray[0]);
            resumePlaying(connection);
        } else {
            volume = parseFloat(keyArray[0]);
        }
    }
}, {
    identifier: 'add',
    minLength: 4,
    action: function(connection, keyString, keyArray) {
        console.log(keyArray);
        var name = keyArray[0].replace(/_/g, ' ');
        var artist = keyArray[1].replace(/_/g, ' ');
        var album = keyArray[2].replace(/_/g, ' ');
        var url = keyArray[3];
        downloadVideo(name, artist, album, url, function() {
            sendMessage(connection, "Added " + name);
        });
    }
}, {
    identifier: 'list',
    minLength: 0,
    action: function(connection, keyString, keyArray) {

        getDatabaseEntries(function(rows) {
            var message = "Here's what's in the library:<br>";
            for (var i = 0; i < rows.length; ++i) {
                var thisLine = String(i+1) + ". " + rows[i].title + " by " + rows[i].artist + " in " + rows[i].album + (i == (rows.length - 1) ? "" : "<br>");
                message += thisLine;
            }
            sendMessage(connection, message);
        });
    }
}, {
    identifier: 'play',
    minLength: 1,
    action: function(connection, keyString, keyArray) {
        var index = parseInt(keyArray[0]) - 1;
        getFilename(index, function(file) {
            console.log("Playing " + file);
            playSound(connection, file);
        })
    }
}, {
    identifier: 'pause',
    minLength: 0,
    action: function(connection, keyString, keyArray) {
        pausePlaying(connection)
    }
}, {
    identifier: 'resume',
    minLength: 0,
    action: function(connection, keyString, keyArray) {
        resumePlaying(connection);
    }
}, {
    identifier: 'stop',
    minLength: 0,
    action: function(connection, keyString, keyArray) {
        stopPlaying(connection);
    }
}];

var performCommand = function(connection, keyWord, commandText, commandArray, actor) {

    var foundCommand = false;
    for (var i = 0; i < oneWordCommands.length; i++) {
        if (oneWordCommands[i][0] === keyWord) {
            console.log('Received command: ' + oneWordCommands[i][0]);
            sendMessage(connection, oneWordCommands[i][1]);

            foundCommand = true;
            break;
        }
    }
    if (!foundCommand) {
        for (var i = 0; i < commands.length; i++) {
            var command = commands[i];
            //TODO: array identifiers
            //This looks for a command with a matching keyword
            if (command.identifier === keyWord) {
                console.log('Received command: ' + command.identifier);
                //execture if found
                command.action(connection, commandText, commandArray, actor);
                foundCommand = true;
                break;
            }
        }
    }

    if (!foundCommand) {
        sendMessage(connection, 'Command not found');
    }
}

function downloadVideo(name, artist, album, url, callback) {
    var fileString = name + " - " + artist + " on " + album + ".m4a";
    child = exec("python3 downloader.py \"" + fileString + "\" " + url, function (error, stdout, stderr) {
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

    db.serialize(function() {
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
    db.serialize(function() {
        db.run("CREATE TABLE IF NOT EXISTS songs (title TEXT, artist TEXT, album TEXT, file TEXT)");

        db.each("SELECT * FROM songs", function(err, row) {
            entries.push(row);
        }, function() {
            ///Done
            callback(entries);
        });
    });

    db.close();
}

function getFilename(index, callback) {
    getDatabaseEntries(function(rows) {
        var file = rows[index].file;
        callback(file);
    });
}

//scream.pipe(connection.inputStream());
