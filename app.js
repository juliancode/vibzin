var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose");
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

	socket.on('new user', function(data, callback){
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

	socket.on('disconnect', function(data){
		if(!socket.nickname) return;
		delete users[socket.nickname];
		updateNicknames();
		socket.broadcast.emit('user leave', {nick: socket.nickname});
	});

	// socket.on('new video', function(data, callback){
	// 	addToCue(data.id, socket.nickname, getCueFromDb)
	// 	io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
	// });

	socket.on('new video', function(data, callback){
		addToCue(data.id, socket.nickname, getCueFromDb(function() {
			io.sockets.emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
		}));
	});

	socket.on('play next video', function(data) {
		removeVideo(cue[0], getCueFromDb(function() {
			console.log("get cue from db callback called")
			io.sockets.emit('next video');
		}));	
	});

	socket.on('send message', function(data, callback){
		if (data === '!empty')
			dropDb();
		var msg = data.trim();
		io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
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

function getCueFromDb(callback) {
	console.log("getCueFromDb()", cue)
	Video.find({}).exec(function(err, videos) {
			if (err) {
				console.log(err)
			}
			if (videos.length) {
				console.log("Videos found in db pushed to client")
				cue.length = 0 // empty array
				videos.forEach(function(video) {
					cue.push(video.id) // push all the videos from db into cue array
				});
				console.log("Sending this cue to client", cue)
				io.sockets.emit('send cue', {cue: cue});
			}
			else {
				io.sockets.emit('send cue', {cue: cue});
				console.log("No more videos in database!")
			}
		if (callback)
			callback();
		else 
			return
	});	
}

function dropDb() {
	Video.find({}).remove(function(err, data) {
		if (err)
			console.log(err)
	});
}

function removeVideo(id, callback) {
	Video.find({'id' : id}).remove(function(err, data) {
		if (err)
			console.log(err)
		console.log("Removed video", id)
		cue.shift();
		if (callback)
			callback();
		else
			return
	});
}

function addToCue(id, user, callback) {
	console.log("Add to cue called", cue)
	var video = new Video();
	video.id = id;
	video.user = user;
	video.save(function(err, data){
		if (err)
			console.log(err)
	})
	if (callback)
		callback()
	else 
		return
}