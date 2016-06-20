var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	Video = require('./js/db').Video,
	users = {},
	cue = {
		id: [],
		title: [],
	},
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

	socket.on('vote skip', function(data) {
		console.log(data)
		if (data.skipvotes >= Math.round(Object.keys(users).length)/2) {
			io.sockets.emit('skip', {skip: true, skipvotes: data.skipvotes, username: socket.nickname})
		} else {
			io.sockets.emit('skip', {skip: false, skipvotes: data.skipvotes, username: socket.nickname})
		}
	});

	socket.on('new video', function(data) {
		console.log("New video")
		// var addToCueP = Promise.promisify(addToCue)
		// var getCueFromDbP = Promise.promisify(getCueFromDb)

		return addToCue(data.id, data.title)
		.then(function() {
			return getCueFromDb();
		})
		.then(function() {
			console.log("Emit change video")
			io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	// socket.on('new video', function(data) {
	// 	console.log("New video")

	// 	Promise.join(addToCue(data.id, socket.nickname), getCueFromDb(), function() {
	// 		console.log("Emit change video")
	// 		io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
	// 	}).catch(function(e) {
	// 		console.log("error", e)
	// 	});
	// });

	socket.on('play next video', function() {
		// var removeVideoP = Promise.promisify(removeVideo)
		// var getCueFromDbP = Promise.promisify(getCueFromDb)

		return removeVideo(cue.id[0])
			.then(function() {
				return getCueFromDb();
			})
			.then(function() {
				io.sockets.emit('next video');
			})
	});	

	// socket.on('play next video', function() {
	// 	Promise.join(removeVideo(cue[0]), getCueFromDb(), function() {
	// 		console.log("Emit next video")
	// 		io.sockets.emit('next video');
	// 	});
	// });	

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
	return new Promise(function(resolve, reject) {
		Video.find({}).exec(function(err, videos) {
				if (err) {
					reject(err);
				}
				if (videos.length) {

					cue.id = []; // empty array
					cue.title = [];
					videos.forEach(function(video) {
						cue.id.push(video.id) // push all the videos from db into cue array
						cue.title.push(video.title)
					});
					console.log(cue)
					io.sockets.emit('send cue', {cue: cue.id, title: cue.title});
					console.log("getCueFromDb", cue.id)
					resolve();
					if (callback) {
						callback();
						return
					}
					else {
						return
					}
				}
				else {
					cue.id = [];
					cue.title = [];
					io.sockets.emit('send cue', {cue: cue.id, title: cue.title});
					console.log(cue)
					console.log("getCueFromDb (no videos)", cue.id)
					resolve();
					if (callback)
						callback()
					else
						return
				}
		})	
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

var removeVideo = function(id) {
	return new Promise(function(resolve, reject) {
		Video.find({'id' : id}).remove(function(err, data) {
			if (err)
				reject(err);
			else {
				console.log("Remove video")
				resolve();
			}
		});
	})
}

var addToCue = function(id, title) {
	console.log("Add to cue")
	return new Promise(function(resolve, reject) {
		var video = new Video();
		console.log(title)
		video.id = id;
		video.title = title;
		video.save(function(err, data) {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	})
}