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
    VOICE_JOIN: 'voice-join',
    VOICE_LEAVE: 'voice-leave',
    VOICE_OFFER: 'voice-offer',
    VOICE_ANSWER: 'voice-answer',
    VOICE_ICE_CANDIDATE: 'voice-ice-candidate',
    VOICE_MUTE_STATE: 'voice-mute-state',
};

const server=http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, '../client/build')));
app.use((req,res,next)=>{
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
})

const userSocketMap = {};
const voiceUsersMap = {};

function getAllConnectedClients(roomId){
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId)=>{
        return{
            socketId,
            username:userSocketMap[socketId],
        }
    });
}

function getVoiceUsersInRoom(roomId) {
    return getAllConnectedClients(roomId)
        .filter(({ socketId }) => voiceUsersMap[socketId])
        .map(({ socketId }) => ({
            socketId,
            isMuted: voiceUsersMap[socketId].isMuted,
        }));
}

function broadcastVoiceState(roomId) {
    const voiceUsers = getVoiceUsersInRoom(roomId);
    io.to(roomId).emit(ACTIONS.VOICE_JOIN, { voiceUsers });
}


io.on('connection', (socket) => {
    console.log('a user connected',socket.id);
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        const voiceUsers = getVoiceUsersInRoom(roomId);
        clients.forEach(({socketId})=>{
            io.to(socketId).emit(ACTIONS.JOINED,{
                clients,
                username,
                socketId: socket.id,
                voiceUsers,
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

    socket.on(ACTIONS.VOICE_JOIN, ({ roomId }) => {
        voiceUsersMap[socket.id] = { isMuted: false };
        broadcastVoiceState(roomId);
    });

    socket.on(ACTIONS.VOICE_LEAVE, ({ roomId }) => {
        delete voiceUsersMap[socket.id];
        broadcastVoiceState(roomId);
    });

    socket.on(ACTIONS.VOICE_MUTE_STATE, ({ roomId, isMuted }) => {
        if (voiceUsersMap[socket.id]) {
            voiceUsersMap[socket.id].isMuted = isMuted;
            broadcastVoiceState(roomId);
        }
    });

    socket.on(ACTIONS.VOICE_OFFER, ({ to, offer }) => {
        io.to(to).emit(ACTIONS.VOICE_OFFER, { from: socket.id, offer });
    });

    socket.on(ACTIONS.VOICE_ANSWER, ({ to, answer }) => {
        io.to(to).emit(ACTIONS.VOICE_ANSWER, { from: socket.id, answer });
    });

    socket.on(ACTIONS.VOICE_ICE_CANDIDATE, ({ to, candidate }) => {
        io.to(to).emit(ACTIONS.VOICE_ICE_CANDIDATE, { from: socket.id, candidate });
    });

    socket.on('disconnecting',()=>{
        const rooms = [...socket.rooms].filter((roomId) => roomId !== socket.id);
        rooms.forEach((roomId) => {
            socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        })
        delete userSocketMap[socket.id];
        delete voiceUsersMap[socket.id];
    })
});

const PORT=process.env.PORT || 5000;
server.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});