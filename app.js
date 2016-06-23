var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	Video = require('./js/db').Video,
	User = require('./js/db').User,
	people = {},
	users = {
		name: [],
		vibes: [],
	},
	cue = {
		id: [],
		title: [],
		user: {
			name: [],
			vibes: [],
		},
	},
	fired = false;
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
		return getUsersFromDb()
		.then(function() {
			if (users.name.indexOf(data) > -1) {
				callback(false);
				console.log("No fam")
			} 
			else {
				callback(true);
				socket.nickname = data;
				people[socket.nickname] = socket;
				updateNicknames();
				var user = new User();
				user.name = data;
				user.save(function(err, data) {
					if (err) {
						console.log(err)	
					}
					else {
						getUsersFromDb()
						.then(function() {
							updateNicknames()
						})
						.catch(function(e) {
							console.log("Error", e)
						})
					}
				});
				socket.broadcast.emit('user join', {nick: socket.nickname});
			} 
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('disconnect', function(data) {
		if (!socket.nickname) {
			console.log("No socket nickname")
			return
		}
		else {
			return removeUser(socket.nickname)
			.then(function() {
				console.log("uno")
				var index = users.name.indexOf(socket.nickname)
				if (index > -1) {
					users.name.splice(index, 1);
				}
				console.log("yes im being excuted")
				delete people[socket.nickname];
				getUsersFromDb();
				socket.broadcast.emit('user leave', {nick: socket.nickname});	
			})
			.catch(function(e) {
				console.log("Error", e)
			})
		}
	});

	socket.on('vote skip', function(data) {
		console.log(data)
		if (data.skipvotes >= Math.round(Object.keys(people).length)/2) {
			io.sockets.emit('skip', {skip: true, skipvotes: data.skipvotes, username: socket.nickname})
		} else {
			io.sockets.emit('skip', {skip: false, skipvotes: data.skipvotes, username: socket.nickname})
		}
	});

	socket.on('new video', function(data) {
		console.log("New video")

		return addToCue(data.id, data.title, socket.nickname)
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

	socket.on('play next video', function() {
		console.log(fired)
		if (!fired) {
			fired = true;
			setTimeout(function() { 
				fired = false;}, 3000);
			return removeVideo(cue.id[0])
				.then(function() {
					return getCueFromDb();
				})
				.then(function() {
					io.sockets.emit('next video');
				})
				.catch(function(e) {
					console.log("Error", e)
				})
		}
	});	

	socket.on('send message', function(data, callback){
		var msg = data.trim();
		io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
	});

	socket.on('pause video', function(data) {
		io.sockets.emit('pause video');
	});

	socket.on('play video', function(data) {
		io.sockets.emit('play video');
	});

	socket.on('good vibe', function(data) {
		console.log(data)
		return changeVibe('good', data)
		.then(function() {
			return getUsersFromDb()
		})
		.then(function() {
			return updateNicknames();
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('bad vibe', function(data) {
		return changeVibe('bad', data)
		.then(function() {
			updateNicknames();
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});
});

// function updateNicknames(){
// 	io.sockets.emit('usernames', Object.keys(people));
// }

function updateNicknames(){
	console.log("Update nicknames")
	io.sockets.emit('usernames', {vibzer: users.name, numberofvibes: users.vibes});
}


var emptyCue = function() {
	cue.id = []; // empty array
	cue.title = [];
	cue.user.name = [];
}

var emptyUser = function() {
	users.name = [];
	users.vibes = [];
}

var getUsersFromDb = function() {
	console.log("getUsersFromDb")
	return new Promise(function(resolve, reject) {
		User.find({}).exec(function(err, vibzers) {
			if (err) {
				console.log(err);
				reject(err);
			}
			if (vibzers.length) {
				emptyUser();
				vibzers.forEach(function(vibzer) {
					users.name.push(vibzer.name); // push all the videos from db into cue array
					users.vibes.push(vibzer.vibes);
					if (users.vibes.length === vibzers.length) {
						console.log(users.vibes, vibzer.vibes)
						resolve();
					}
					// else {
					// 	console.log("fail", users.vibes.length, vibzers.length)
					// }
				});
			} else {
				resolve()
			}
		});
	});
}

var removeUser = function(nick) {
	console.log(nick)
	return new Promise(function(resolve, reject) {
		User.find({'name' : nick}).remove(function(err, data) {
			if (err)
				reject(err);
			else {
				console.log("Remove user")
				resolve();
			}
		});
	})
}

var getCueFromDb = function() {
	return new Promise(function(resolve, reject) {
		Video.find({}).exec(function(err, videos) {
				if (err) {
					reject(err);
				}
				if (videos.length) {
					emptyCue();
					videos.forEach(function(video) {
						cue.id.push(video.id) // push all the videos from db into cue array
						cue.title.push(video.title)
						cue.user.name.push(video.user.name)
					});
					io.sockets.emit('send cue', {cue: cue.id, title: cue.title, nick: cue.user.name});
					resolve();
				}
				else {
					emptyCue();
					io.sockets.emit('send cue', {cue: cue.id, title: cue.title, nick: cue.user.name});
					resolve();
				}
		})	
	})
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

var addToCue = function(id, title, nick) {
	console.log("Add to cue")
	return new Promise(function(resolve, reject) {
		var video = new Video();
		console.log(title)
		video.id = id;
		video.title = title;
		video.user.name = nick;
		video.save(function(err, data) {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	})
}

var changeVibe = function(vibe, nick) {
	if (vibe === "good") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': nick}, { $inc: { vibes: 1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
	if (vibe === "bad") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': nick}, { $inc: { vibes: -1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}