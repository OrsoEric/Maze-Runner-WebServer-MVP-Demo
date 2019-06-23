//operating system library. Used to get local IP address
var os = require("os");
//file system library. Used to load file stored inside back end server (https://nodejs.org/api/fs.html)
var fs = require("fs");
//http system library. Handles basic html requests
var http = require("http").createServer(http_handler);
//url library. Used to process html url requests
var url = require("url");
//Websocket
var io = require("socket.io")(http);
//Websocket used to stream video
var websocket = require("ws");
//Communicate with the RPI hardware serial port on the GPIO
var SerialPort = require("serialport");

//-----------------------------------------------------------------------------------
//	CONFIGURATION
//-----------------------------------------------------------------------------------

//Port the server will listen to
var server_port = 8080;
var websocket_stream_port = 8082;
//Path of the http and css files for the http server
var file_index_name = "index.html";
var file_css_name = "style.css";
var file_jsplayer_name = "jsmpeg.min.js";
//Http and css files loaded into memory for fast access
var file_index;
var file_css;
var file_jsplayer;
//Name of the local video stream
var stream_name = "mystream";

//-----------------------------------------------------------------------------------
//	MOTOR VARIABLES
//-----------------------------------------------------------------------------------

//Speed of the right and left wheels. Arbitrary unit. range from -13 to +13 integer
var vel_r = 0;
var vel_l = 0;
//Minimum and maximum speed allowed
var min_velocity = 3;
var max_velocity = 13;
var velocity = 5;
//Ratio of forward to sideways during turn. 0 full turn, 1 full forward
var steering_ratio = 0.7;
//Map of keys that are down
var key_forward = 0;
var key_backward = 0;
var key_left = 0;
var key_right = 0;

//-----------------------------------------------------------------------------------
//	DETECT SERVER OWN IP
//-----------------------------------------------------------------------------------

//If just one interface, store the server IP Here
var server_ip;
//Get local IP address of the server
//https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
var ifaces = os.networkInterfaces();

Object.keys(ifaces).forEach
(
	function (ifname)
	{
		var alias = 0;

		ifaces[ifname].forEach
		(
			function (iface)
			{
				if ('IPv4' !== iface.family || iface.internal !== false)
				{
				  // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
				  return;
				}

				if (alias >= 1)
				{
					// this single interface has multiple ipv4 addresses
					console.log('INFO: Server interface ' +alias +' - ' + ifname + ':' + alias, iface.address);
				}
				else
				{
					server_ip = iface.address;
					// this interface has only one ipv4 adress
					console.log('INFO: Server interface - ' +ifname, iface.address);
				}
				++alias;
			}
		);
	}
);

//-----------------------------------------------------------------------------------
//	HTTP SERVER
//-----------------------------------------------------------------------------------
//	Fetch and serves local files to client

//Create http server and listen to the given port
http.listen
(
	server_port,
	function( )
	{
		console.log('INFO: ' +server_ip +' listening to html requests on port ' +server_port);
		//Pre-load http, css and js files into memory to improve http request latency
		file_index = load_file( file_index_name );
		file_css = load_file( file_css_name );
		file_jsplayer = load_file( file_jsplayer_name );
	}
);

//-----------------------------------------------------------------------------------
//	HTTP REQUESTS HANDLER
//-----------------------------------------------------------------------------------
//	Answer to client http requests. Serve http, css and js files

function http_handler(req, res)
{
	//If client asks for root
	if (req.url == '/')
	{
		//Request main page
		res.writeHead( 200, {"Content-Type": detect_content(file_index_name),"Content-Length":file_index.length} );
		res.write(file_index);
		res.end();

		console.log("INFO: Serving file: " +req.url);
	}
	//If client asks for css file
	else if (req.url == ("/" +file_css_name))
	{
		//Request main page
		res.writeHead( 200, {"Content-Type": detect_content(file_css_name),"Content-Length" :file_css.length} );
		res.write(file_css);
		res.end();

		console.log("INFO: Serving file: " +req.url);
	}
	//If client asks for css file
	else if (req.url == ("/" +file_jsplayer_name))
	{
		//Request main page
		res.writeHead( 200, {"Content-Type": detect_content(file_jsplayer_name),"Content-Length" :file_jsplayer.length} );
		res.write(file_jsplayer);
		res.end();

		console.log("INFO: Serving file: " +req.url);
	}
	//Listening to the port the stream from ffmpeg will flow into
	else if (req.url = "/mystream")
	{
		res.connection.setTimeout(0);

		console.log( "Stream Connected: " +req.socket.remoteAddress + ":" +req.socket.remotePort );

		req.on
		(
			"data",
			function(data)
			{
				streaming_websocket.broadcast(data);
			}
		);

		req.on
		(
			"end",
			function()
			{
				console.log("local stream has ended");
				if (req.socket.recording)
				{
					req.socket.recording.close();
				}
			}
		);

	}
	//If client asks for an unhandled path
	else
	{
		res.end();
		console.log("ERR: Invalid file request" +req.url);
	}
}

//-----------------------------------------------------------------------------------
//	WEBSOCKET SERVER: CONTROL/FEEDBACK REQUESTS
//-----------------------------------------------------------------------------------
//	Handle websocket connection to the client

io.on
(
	"connection",
	function (socket)
	{
		console.log("connecting...");

		socket.emit("welcome", { payload: "Server says hello" });

		//Periodically send the current server time to the client in string form
		setInterval
		(
			function()
			{
				socket.emit("server_time", { server_time: get_server_time() });
			},
			//Send every 333ms
			333
		);

		socket.on
		(
			"myclick",
			function (data)
			{
				timestamp_ms = get_timestamp_ms();
				socket.emit("profile_ping", { timestamp: timestamp_ms });
				console.log("button event: " +" client says: " +data.payload);
			}
		);

		//"ArrowLeft"
		//When a key is pressed, an event is released once
		socket.on
		(
			"key_down",
			function (data)
			{
				timestamp_ms = get_timestamp_ms();
				//socket.emit("profile_ping", { timestamp: timestamp_ms });
				//console.log("key up: " +data.payload);

				process_key_down( data );
				process_robot_velocity();
			}
		);

		//When a key is released, an event is released once
		socket.on
		(
			"key_up",
			function (data)
			{
				timestamp_ms = get_timestamp_ms();
				//socket.emit("profile_ping", { timestamp: timestamp_ms });
				//console.log("key down: " +data.payload);

				process_key_up( data );
				process_robot_velocity();
			}
		);

		//profile packets from the client are answer that allows to compute roundway trip time
		socket.on
		(
			"profile_pong",
			function (data)
			{
				timestamp_ms_pong = get_timestamp_ms();
				timestamp_ms_ping = data.timestamp;
				console.log("Pong received. Round trip time[ms]: " +(timestamp_ms_pong -timestamp_ms_ping));
			}
		);
	}
);

//-----------------------------------------------------------------------------------
//	WEBSOCKET SERVER: STREAMING VIDEO
//-----------------------------------------------------------------------------------
//	Current toolchain is
//	v4l2 -> ffmpeg -(mpeg1 over TS on localhost)-> node -(websocket)-> client -> javascript -> canvas

// Websocket Server
var streaming_websocket = new websocket.Server({port: websocket_stream_port, perMessageDeflate: false});

streaming_websocket.connectionCount = 0;

streaming_websocket.on
(
	"connection",
	function(socket, upgradeReq)
	{
		streaming_websocket.connectionCount++;
		console.log
		(
			'New websocket Connection: ',
			(upgradeReq || socket.upgradeReq).socket.remoteAddress,
			(upgradeReq || socket.upgradeReq).headers['user-agent'],
			'('+streaming_websocket.connectionCount+" total)"
		);

		socket.on
		(
			'close',
			function(code, message)
			{
				streaming_websocket.connectionCount--;
				console.log('Disconnected websocket ('+streaming_websocket.connectionCount+' total)');
			}
		);
	}
);

streaming_websocket.broadcast = function(data)
{
	streaming_websocket.clients.forEach
	(
		function each(client)
		{
			if (client.readyState === websocket.OPEN)
			{
				client.send(data);
			}
		}
	);
};

//-----------------------------------------------------------------------------------
//	SERIAL PORT
//-----------------------------------------------------------------------------------
//	Communication with the HotBlack Hat through GPIO

//Connect to the serial port on th GPIO
var my_uart = new SerialPort
(
	"/dev/ttyS0",
	{
		baudRate: 57600,
		openImmediately: true
	},
	false
);

//-----------------------------------------------------------------------------------
//	SERIAL PORT HANDLER
//-----------------------------------------------------------------------------------
//	Commands
//	"P\0"		ping. Communication time out after 1s and motor stop for safety in case of crash
//	"F\0"		would be signature if RX worked in this demo. Probably an electrical problem on the hat
//	"VR%dL%d\0"	set speed to motors. -13 to +13 are the caps. over 100 make the hat crash. It's a demo.

//Detect port open
my_uart.on
(
	"open",
	function()
	{
		console.log("Port is open!");
		//Periodically send the current server time to the client in string form
		setInterval
		(
			function()
			{
				maze_runner_vel( vel_r, vel_l );
			},
			//Send periodically speed to the motors
			50
		);
	}
);

//Data from hat. Currently does not work neither in HW nor in SW.
my_uart.on
(
	'data',
	function(data)
	{
		console.log('data received: ' + data);
	}
);

//-----------------------------------------------------------------------------------
//	FUNCTIONS
//-----------------------------------------------------------------------------------

//-----------------------------------------------------------------------------------
//	SERVER DATE&TIME
//-----------------------------------------------------------------------------------
//	Get server time in string form

function get_server_time()
{
	my_date = new Date();

	return my_date.toUTCString();
}

//-----------------------------------------------------------------------------------
//	TIMESTAMP
//-----------------------------------------------------------------------------------
//	Profile performance in ms

function get_timestamp_ms()
{
	my_date = new Date();
	return 1000.0* my_date.getSeconds() +my_date.getMilliseconds()
}

//-----------------------------------------------------------------------------------
//	FILE LOADER
//-----------------------------------------------------------------------------------
//	Load files into memory for improved latency

function load_file( file_name )
{
	var file_tmp;
	var file_path =  __dirname +"/" +file_name;

	//HTML index file
	try
	{
		file_tmp = fs.readFileSync( file_path );
	}
	catch (err)
	{
		console.log("ERR: " +err.code +" failed to load: " +file_path);
		throw err;
	}

	console.log("INFO: " +file_path +" has been loaded into memory");

	return file_tmp;
}

//-----------------------------------------------------------------------------------
//	CONTENT TYPE DETECTOR
//-----------------------------------------------------------------------------------
//	Return the right content type to give correct information to the client browser

function detect_content( file_name )
{
	if (file_name.includes(".html"))
	{
        return "text/html";
	}
	else if (file_name.includes(".css"))
	{
		return "text/css";
	}
	else if (file_name.includes(".js"))
	{
		return "application/javascript";
	}
	else
	{
		throw "invalid extension";

	}
}

//-----------------------------------------------------------------------------------
//	SEND SERIAL PORT MESSAGES
//-----------------------------------------------------------------------------------

//Send ping message to keep the connection alive
function maze_runner_ping( )
{
	my_uart.write
	(
		"P\0",
		function(err, res)
		{
			if (err)
			{
				console.log("err ", err);
			}
		}
	);
}

//Compute the speed message to send to maze runner
function maze_runner_vel( vel_r, vel_l )
{
	var msg;

	msg = "VR" +vel_r +"L" +vel_l +"\0";

	my_uart.write
	(
		msg,
		function(err, res)
		{
			if (err)
			{
				console.log("err ", err);
			}
		}
	);
}

//-----------------------------------------------------------------------------------
//	USE KEYBOARD TO MOVE ROBOT
//-----------------------------------------------------------------------------------

//When key is pressed, activate the relevant robot direction
function process_key_down( data )
{
	switch(data.payload)
	{
		//Increase Speed
		case "+":
            velocity++;
            if (velocity > max_velocity)
			{
				velocity = max_velocity;
			}
			break;
		case "-":
			velocity--;
            if (velocity < min_velocity)
			{
				velocity = min_velocity;
			}
			break;
		case "w":
		case "W":
			key_forward = 1;
			break;
		case "s":
		case "S":
			key_backward = 1;
			// code block
			break;
		case "a":
		case "A":
			key_left = 1;
			break;
		case "d":
		case "D":
			key_right = 1;
			// code block
			break;

		default:
			//do nothing
			break;
	}
}

//When key is released, deactivate the relevant robot direction
function process_key_up( data )
{
	switch(data.payload)
	{
		case "w":
		case "W":
			key_forward = 0;
			break;
		case "s":
		case "S":
			key_backward = 0;
			// code block
			break;
		case "a":
		case "A":
			key_left = 0;
			break;
		case "d":
		case "D":
			key_right = 0;
			// code block
			break;
		default:
			//do nothing
			break;
	}
}

//-----------------------------------------------------------------------------------
//	COMPUTE MOTOR SPEED FROM DIRECTION
//-----------------------------------------------------------------------------------
//	Based on the keys down and the top speed process the speed to send to the motors

function process_robot_velocity()
{
	//Detect number of keys down
	var sum = key_forward +key_backward +key_left +key_right;
	//console.log("INFO: ", key_forward, key_backward, key_left, key_right);
	//No keys. Robot stopped
	if (sum == 0)
	{
		//robot is stopped
		vel_r = 0;
		vel_l = 0;
	}
	//Full in one direction
	else if (sum == 1)
	{
		if (key_forward == 1)
		{
			//Both motors are forward at maximum velocity
			vel_r = velocity;
			vel_l = velocity;
		}
		else if (key_backward == 1)
		{
			//Both motors are forward at maximum velocity
			vel_r = -velocity;
			vel_l = -velocity;
		}
		else if (key_right == 1)
		{
			//Both motors are forward at maximum velocity
			vel_r = -velocity;
			vel_l = velocity;
		}
		else if (key_left == 1)
		{
			//Both motors are forward at maximum velocity
			vel_r = velocity;
			vel_l = -velocity;
		}
		else
		{


		}
	}
	//Two keys down. Not all eight combination are valid
	else if (sum == 2)
	{

		if ((key_forward == 1) && (key_right == 1))
		{
			//Weaken one motor to turn
			vel_r = Math.floor(velocity*steering_ratio);
			vel_l = velocity;
		}
		else if ((key_forward == 1) && (key_left == 1))
		{
			//Weaken one motor to turn
			vel_r = velocity;
			vel_l = Math.floor(velocity*steering_ratio);
		}
		else if ((key_backward == 1) && (key_right == 1))
		{
			//Weaken one motor to turn
			vel_r = Math.floor(velocity*steering_ratio);
			vel_l = velocity;
		}
		else if ((key_backward == 1) && (key_left == 1))
		{
			//Weaken one motor to turn
			vel_r = velocity;
			vel_l = Math.floor(velocity*steering_ratio);
		}
		else
		{
			//do nothing, the user did a mistake
			//Hold previous speed
		}
	}
	//three keys and above maintain previous direction
	else
	{
		//the user just pressed one more while switching key
		//do nothing
	}
}
