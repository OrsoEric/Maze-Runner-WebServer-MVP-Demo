# Maze-Runner-WebServer-MVP-Demo
NODE.JS webserver hosted inside Maze Runner. It provides a webpage that allows remote control of Maze Runner through a browser<br>

# Dependencies
HW: Raspberry Pi 3B+<br>
OS: Raspbian Stretch<br>
SW:
1) NODE.JS<br>
1.1) Socket.IO<br>
1.2) Websocket<br>
2) FFMPEG<br>

# Commands
execute the webserver in background to provide the webpage on the browser<br
pi@MazeRunner:~ $ node 2019-06-15-test-serial/demo.js &<br>
execute the transcoder to stream the video<br>
pi@MazeRunner:~ $ ffmpeg -f v4l2 -framerate 20 -video_size 640x480 -i /dev/video0 -f mpegts -codec:v mpeg1video -s 640x480 -b:v 600k -bf 0 http://localhost:8080/mystream<br>

# Features 
1) Stream video from USB camera on the raspberry to the webbrowser 640x480@20FPS@300mS<br>
2) Bidirectional real time control through websocket 7mS<br>
3) wasd operate the servomotors<br>
[VIDEO of the MVP demo in action](https://www.youtube.com/watch?v=rEVTI9Kiidc)

# Architecture

![Architecture](https://github.com/OrsoEric/Maze-Runner-WebServer-MVP-Demo/blob/master/2019-06-22%20maze%20Runner%20Architecture.jpg)

# Latency

![Latency](https://github.com/OrsoEric/Maze-Runner-WebServer-MVP-Demo/blob/master/2019-06-23-mazeRUnner%20MVP%20Latency.jpg)
