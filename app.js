var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	Video = require('./js/db').Video,
	users = {},
	cue = [],
	port = Number(process.env.PORT || 3000)

server.listen(port, function() {
	console.log("now listening on: " + port);
});

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index1.html');
});

io.on('connection', function(socket) {
	getCueFromDb();

	socket.on('new user', function(data, callback) {
		if (data in users) {
			callback(false);
		} else {
			callback(true);
			socket.nickname = data;
			users[socket.nickname] = socket;
			updateNicknames();
			socket.broadcast.emit('user join', {nick: socket.nickname});
		} 
	});

	socket.on('disconnect', function(data) {
		if(!socket.nickname) return;
		delete users[socket.nickname];
		updateNicknames();
		socket.broadcast.emit('user leave', {nick: socket.nickname});
	});

	socket.on('new video', function(data) {
		var addToCueP = Promise.promisify(addToCue)
		var getCueFromDbP = Promise.promisify(getCueFromDb)

		addToCueP(data.id, socket.nickname)
			.then(function() {
				return getCueFromDbP();
			})
			.then(function() {
				io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
			})			
	})

	socket.on('skip', function(data, callback) {
		if (data.skipped+1 >= Object.keys(users).length/2) {
			io.sockets.emit('skipped video');
		}
		else {
			console.log("Not enough people voted to skip!")
		}
	})

	socket.on('play next video', function() {
		console.log("play next video socket", cue)
		var removeVideoP = Promise.promisify(removeVideo)
		var getCueFromDbP = Promise.promisify(getCueFromDb)

		removeVideoP(cue[0])
			.then(function() {
				return getCueFromDbP();
			})
			.then(function() {
				console.log("end of play next video socket", cue)
				io.sockets.emit('next video');
			})
	});	

	socket.on('send message', function(data, callback){
		if (data === '!empty') {
			dropDb(function(err) { 
				err ? console.log(err) : getCueFromDb(function() {
					var msg = data.trim();
					io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
				});
			})
		} else {
			var msg = data.trim();
			io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
		}
	});

	socket.on('pause video', function(data) {
		io.sockets.emit('pause video');
	});

	socket.on('play video', function(data) {
		io.sockets.emit('play video');
	});

});

function updateNicknames(){
	io.sockets.emit('usernames', Object.keys(users));
}

var getCueFromDb = function(callback) {
	console.log("getCueFromDb Called outside IF")
	Video.find({}).exec(function(err, videos) {
			if (err) {
				return err;
			}
			if (videos.length) {
				cue = []; // empty array
				videos.forEach(function(video) {
					cue.push(video.id) // push all the videos from db into cue array
					console.log("pushed", video.id)
				});
				console.log("Get cue from db called", cue);
				io.sockets.emit('send cue', {cue: cue});
				if (callback) {
					console.log("callback called on getCueFromDb", callback)
					callback();
					return
				}
				else {
					console.log("no callback called on getCueFromDb")
					return
				}
			}
			else {
				cue = [];
				io.sockets.emit('send cue', {cue: cue});
				console.log("Get cue from db no videos left", cue);
				if (callback)
					callback()
				else
					return
			}
	})
}

var dropDb = function(callback) {
	Video.find({}).remove(function(err, data) {
		if (err)
			console.log(err)
		else 
			return
		if (callback)
			callback();
		else
			return
	});
}

var removeVideo = function(id, callback) {
	Video.find({'id' : id}).remove(function(err, data) {
		if (err)
			return (err)
		else {
			console.log("Removed video", id)
			cue.shift();
			if (callback) {
				console.log("callback called on removeVideo")
				callback();
				return
			}
			else {
				console.log("no callback called on removeVideo")
				return
			}
		}
	});
}

var addToCue = function(id, user, callback) {
	var video = new Video();
	video.id = id;
	video.user = user;
	video.save(function(err, data) {
		if (err) {
			console.log(err)
		} else {
			console.log("added", video.id);
		}
		if (callback) {
			console.log("add to cue", callback);
			callback();
		}
		else {
			console.log("No callback in addToCue");
		}
	});
}