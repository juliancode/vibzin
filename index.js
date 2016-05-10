var app = require('express')(),
	express = require('express'),
	http = require('http').Server(app),
	io = require('socket.io')(http);

var nicknames = [];

app.use(express.static('css'));
app.use(express.static('js'));


app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
	socket.on('new user', function(data, callback) {
		if (data in users) {
			callback(false);
		} else {
			callback(true);
			socket.nickname = data;
			users[socket.nickname] = socket;
			updateNicknames();
		}
	});

	function updateNicknames() {
		
	}

	socket.broadcast.emit('user connect');

	socket.on('chat message', function(msg) {
		io.emit('chat message', msg);
	});
});
	
http.listen(1337, function(){
  console.log('listening on *:1337');
});