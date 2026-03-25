const express = require('express');
const { Server } = require("socket.io");
const app = express();
const http=require('http');
const path = require('path');

const ACTIONS = {
    JOIN: 'join',
    JOINED: 'joined',
    DISCONNECTED: 'disconnected',
    CODE_CHANGE: 'code-change',
    SYNC_CODE: 'sync-code',
    LEAVE: 'leave',
};

const server=http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('build'));
app.use((req,res,next)=>{
    res.sendFile(path.join(__dirname,'build','index.html'));
})

const userSocketMap = {};
function getAllConnectedClients(roomId){
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId)=>{
        return{
            socketId,
            username:userSocketMap[socketId],
        }
    });
}


io.on('connection', (socket) => {
    console.log('a user connected',socket.id);
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({socketId})=>{
            io.to(socketId).emit(ACTIONS.JOINED,{
                clients,
                username,
                socketId: socket.id,
            })
        })
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        // Broadcast to everyone else in the room.
        socket.to(roomId).emit(ACTIONS.CODE_CHANGE, { code })
    })

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.SYNC_CODE, {code})
    })

    socket.on('disconnecting',()=>{
        const rooms = [...socket.rooms].filter((roomId) => roomId !== socket.id);
        rooms.forEach((roomId) => {
            socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        })
        delete userSocketMap[socket.id];
    })
});

const PORT=process.env.PORT || 5000;
server.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});