var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require("mongoose"),
	Promise = require("bluebird"),
	bodyParser = require('body-parser'),
	Cue = require('./js/db').Cue,
	User = require('./js/db').User,
	Channel = require('./js/db').Channel,
	port = Number(process.env.PORT || 3000),
	hasChangedVideo = false;

server.listen(port, function() {
	console.log("now listening on: " + port);
});

app.use(bodyParser.urlencoded({ extended: false} ));

app.set('view engine', 'ejs')

app.get('/', function(req, res) {
	channel = req.path.substring(1)
	console.log(channel)
	res.render(__dirname + '/views/channel.ejs');
});

app.post('/', function(req, res) {
	res.render(__dirname + '/views/channel.ejs')
})

app.get('/:channel', function(req, res) {
	channel = req.path.substring(1)
	return getChannel(channel)
	.then(function(channel) {
		res.render(__dirname + '/views/channel.ejs', channel);
	})
});

app.get('/create/channel', function(req, res) {
	res.render(__dirname + '/views/createChannel.ejs');
});

app.post('/create/channel', function(req, res) {
	var regex = /^[a-z0-9_-]*$/;
	patt = new RegExp(regex);
	var result = patt.test(req.body.id) 

	if (result) {
		return getChannel(req.body.id)
		.then(function(channel) {
			if (channel) {
				res.render(__dirname + '/views/createChannel.ejs', {
						error: "Sorry that channel exists"
					})
			} else {
				return addChannel(req.body.id, req.body.owner, req.body.description)
				.then(function() {
					res.redirect('/' + req.body.id)
				})
			}
		})
	} else {
		res.render(__dirname + '/views/createChannel.ejs', {
			error: "Channel names can only contain lowercase letters, numbers, - and _"
		})
	}

});

app.use(express.static('public'));

// Start of Socket code

function joinRoomListener(socket, currentRoom) {
	socket.on('join room', function(data) {
		currentRoom = data;
		socket.join(data)
		getCue(data)
			.then(function(cue) {
				io.sockets.in(data).emit('send cue', cue);
			})
			.catch(function(err) {
				console.log("Error", err)
			})	
	})
}

io.on('connection', function(socket) {
	var currentRoom;
	joinRoomListener(socket, currentRoom)

	socket.on('new user', function(data, callback) {
			console.log("New user")
			var online
			isUserOnline(data.nick)
			.then(function(result) {
				online = result
				return getUsers()
			})
			.then(function(users) {
	     		var userNames = users.map(function(user) { return user.name })
	     		// if user exists in database & is online callbackfalse
				if (userNames.indexOf(data.nick) > -1 && online)
					callback(false); 	
				// if user exists in database but isnt online
				else if (userNames.indexOf(data.nick) > -1) {
					socket.nickname = data.nick;
					userOnline(data.nick, data.room)
					.then(function() {
						return getUsersOnline(data.room)
					})
					.then(function(usersOnline) {
						socket.broadcast.to(data.room).emit('user join', {nick: socket.nickname})
						io.sockets.in(data.room).emit('send users', usersOnline)
						callback(true);
					})
				}
				// if user doesnt exist create it
				else {
					socket.nickname = data.nick;
					return addUser(data.nick, data.flag, data.room)
					.then(function() {
						return getUsersOnline(data.room)
						.then(function(usersOnline) {
							console.log(usersOnline)
							socket.broadcast.to(data.room).emit('user join', {nick: socket.nickname})
							io.sockets.in(data.room).emit('send users', usersOnline)
							callback(true);
						})
					})
				}
			})
			.catch(function(e) {
				console.log("Error new user", e, e.stack)
			})
		});

	socket.on('disconnect', function(data) {
		if (!socket.nickname) {
			console.log("No socket nickname")
			return // do nothing if no socket.nicknames
		}
		else {
			return userOffline(socket.nickname)
			.then(function() {
				return getUsersOnline(currentRoom)
				.then(function(usersOnline) {
					socket.broadcast.to(currentRoom).emit('user leave', {nick: socket.nickname});
	        		io.sockets.in(currentRoom).emit('send users', usersOnline);
				})
				.catch(function(e) {
				console.log("Error", e, e.stack)
				})
			})
		}
	})

	socket.on('vote skip', function(data) {
		console.log("Vote skip")
		getUsersOnline(data.room)
		.then(function(usersOnline) {
			if (data.skipvotes >= Math.round(usersOnline.length/2)) {
				io.sockets.in(data.room).emit('skip', {skip: true, skipvotes: data.skipvotes, username: socket.nickname})
			} else {
				io.sockets.in(data.room).emit('skip', {skip: false, skipvotes: data.skipvotes, username: socket.nickname})
			}
		})
	});

	socket.on('new video', function(data) {
		console.log("New video")

		return addToCue(data.id, data.title, socket.nickname, data.room)
		.then(function() {
			return getCue(data.room)
		})
		.then(function(cue) {
			io.sockets.in(data.room).emit('send cue', cue);
		})
		.then(function() {
			console.log("Emit change video")
			io.sockets.in(data.room).emit('change video', {id: data.id, title: data.title, nick: socket.nickname});
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('play next video', function(data) {
		console.log("Play next video")

		// 200ms delay prevents videos firing twice
		if (hasChangedVideo) 
			return
		hasChangedVideo = true;
		setTimeout(function() {
			hasChangedVideo = false;
		}, 400);

		getCue(data.room)
		// if cue.length is TRUE removeFromCue else if FALSE return cue
		.then(function(cue) {
			io.sockets.in(data.room).emit('vibe results', cue)
			return getCue(data.room)
		})
		.then(function(cue) {
			if (cue.length) 
				return removeFromCue(cue[0].id)
			else
				return cue
		})
		.then(function(cue) {
			return getCue(data.room)
		})
		.then(function(cue) {
			io.sockets.in(data.room).emit('send cue', cue);
			return cue
		})
		.then(function(cue) { 
			io.sockets.in(data.room).emit('next video');
			return cue 
		})
		.catch(function(e) {
			console.log("Error")
		})
	})

	socket.on('send message', function(data, callback) {
		var msg = data.msg.trim();
		io.sockets.in(data.room).emit('new message', {msg: msg, nick: socket.nickname});
	});

	socket.on('pause video', function(data) {
		io.sockets.in(data.room).emit('pause video');
	});

	socket.on('play video', function(data) {
		io.sockets.in(data.room).emit('play video');
	});

	socket.on('good vibe', function(data) {
		return getCue(data.room)
		.then(function(cue) {
			return updateVideoVibes('good', cue[0].id)
		})
		.then(function() {
			return updateUserVibes('good', data.user)
		})
		.then(function() {
			return getUsersOnline(data.room)
		})
		.then(function(usersOnline) {
			io.sockets.in(data.room).emit('send users', usersOnline);
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});

	socket.on('bad vibe', function(data) {
		return getCue(data.room)
		.then(function(cue) {
			return updateVideoVibes('bad', cue[0].id)
		})
		.then(function() {
			return updateUserVibes('bad', data.user)
		})
		.then(function() {
			return getUsersOnline(data.room)
		})
		.then(function(usersOnline) {
			io.sockets.in(data.room).emit('send users', usersOnline);
		})
		.catch(function(e) {
			console.log("Error", e)
		})
	});
});

	// End of Socket code

	// User code

	var getUsers = function() {
		console.log("getUsers")
		return new Promise(function(resolve, reject) {
			User.find({}).exec(function(err, users) {
				if (err) {
					console.log(err)
					reject(err)
				}
				 else {
					resolve(users)
				}
			});
		});
	}

	var getUsersOnline = function(channel) {
		console.log("getUsersOnline")
		return new Promise(function(resolve, reject) {
			User.find({ 'channel' : channel, 'online' : 'true' }).exec(function(err, usersOnline) {
				if (err) {
					console.log(err)
					reject(err)
				}
				 else {
					resolve(usersOnline)
				}
			});
		});
	}


	var isUserOnline = function(user) {
		return new Promise(function(resolve, reject) {
			User.findOne({ name : user, online : 'true' }).exec(function(err, onlineUser) {
				if (err) {
					reject(err)
				} 
				if (onlineUser)
					resolve(true)
				else
					resolve(false)
			})
		})
	}

	var userOnline = function(name, channel) {
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name' : name }, { channel : channel, online : true }, function(err, doc) {
				if (err)
					reject("Error userOnline")
				else
					resolve()
			})
		})
	}

	var addUser = function(name, flag, channel) {
		return new Promise(function(resolve, reject) {
			var user = new User();
			user.name = name;
			user.flag = flag;
			user.online = true;
			user.channel = channel;
			user.save(function(err, data) {
				if (err) {
					reject(err)
				}
				else {
					resolve();
				}
			})		
		})
	}

	var removeUser = function(name) {
		return new Promise(function(resolve, reject) {
			User.find({'name' : name}).remove(function(err, data) {
				if (err)
					reject(err);
				else 
					resolve();
			});
		})
	}

	var userOffline = function(name) {
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': name}, { online: false }, function(err, doc) {
				if (err) 
					reject(err)
				else 
					resolve()
			})
		})
	}

	// Cue code

	var getCue = function(channel) {
		console.log("getCue")
		return new Promise(function(resolve, reject) {
			Cue.find({ channel: channel }).exec(function(err, videos) {
				if (err)
					reject(err);
				else 
					resolve(videos);
			})
		})
	}

	// var getCue = function(channel) {
	// 	console.log("getCue", channel)
	// 	return new Promise(function(resolve, reject) {
	// 		Channel.findOne({ id: channel }).exec(function(err, videos) {
	// 			if (err) {
	// 				reject(err);
	// 			} else {
	// 				resolve(videos.cue);
	// 			}
	// 		})
	// 	})
	// }

	var addToCue = function(id, title, user, channel) {
		console.log("Add to cue")
		return new Promise(function(resolve, reject) {
			var video = new Cue();
			console.log(title)
			video.id = id;
			video.title = title;
			video.user.name = user;
			video.channel = channel;
			video.save(function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		})
	}

	// var addToCue = function(id, title, user, channel) {
	// 	console.log("Add to cue")
	// 	return new Promise(function(resolve, reject) {
	// 		Channel.findOneAndUpdate({ id: channel }, {$push, {  })
	// 		var video = new Cue();
	// 		console.log(title)
	// 		video.id = id;
	// 		video.title = title;
	// 		video.user.name = user;
	// 		video.save(function(err, data) {
	// 			if (err) {
	// 				reject(err);
	// 			} else {
	// 				resolve();
	// 			}
	// 		});
	// 	})
	// }

	var removeFromCue = function(id) {
		console.log("Remove video")
		return new Promise(function(resolve, reject) {
			Cue.find({'id' : id}).remove(function(err, data) {
				if (err)
					reject(err);
				else {
					console.log("Remove video resolve")
					resolve();
				}
			});
		})
	}

	// Vibe code

	// Get the vibe a video has received

	var getVibe = function(video) {
		return new Promise(function(resolve, reject) {
			Cue.findOne({ 'id': video }).exec(function(err, doc) {
				if (err)
					reject(err);
				else {
					resolve(doc);
				}
			})
		})
	}

	// Update a video's vibes

	var updateVideoVibes = function(vibe, video) {
		if (vibe === "good") {
			console.log("Good vibe")
			return new Promise(function(resolve, reject) {
				Cue.findOneAndUpdate({ 'id': video}, { $inc: { vibes: 1 } }, { new: true }, function(err, doc) {
					if (err) {
						console.log("error")
						reject(err);
					} else {
						console.log("Returned document after update", doc)
						resolve();
					}
				});
			});
		}
		if (vibe === "bad") {
			console.log("Bad vibe")
			return new Promise(function(resolve, reject) {
				Cue.findOneAndUpdate({ 'id': video}, { $inc: { vibes: -1 } }, { new: true }, function(err, doc) {
					if (err) {
						console.log("error")
						reject(err);
					} else {
						console.log("Returned document after update", doc)
						resolve();
					}
				});
			});
		}
}

// Update a user's vibes

var updateUserVibes = function(vibe, name, video) {
	if (vibe === "good") {
		console.log("Good vibe")
		return new Promise(function(resolve, reject) {
			User.findOneAndUpdate({ 'name': name}, { $inc: { vibes: 1 } }, { new: true }, function(err, doc) {
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
			User.findOneAndUpdate({ 'name': name}, { $inc: { vibes: -1 } }, { new: true }, function(err, doc) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}

//  Channel code

var getChannel = function(id) {
	return new Promise(function(resolve, reject) {
		Channel.findOne({ 'id' : id }).exec(function(err, theChannel) {
			// console.log("getChannel", theChannel, id)
			if (err)
				reject(err)
			else
				resolve(theChannel)
		})
	})
}

var addChannel = function(id, owner, description) {
	return new Promise(function(resolve, reject) { 
		var channel = new Channel()
		channel.id = id;
		channel.owner = owner;
		channel.description = description;
		channel.save(function(err, data) {
			if (err) {
				reject(err)
			}
			else {
				console.log("Add channel resolves", id, owner, description)
				resolve()
			}
		})
	})
}
