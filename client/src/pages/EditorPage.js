import React, { useEffect, useRef, useState } from 'react'
import Client from '../components/Client';
import Editor from '../components/Editor';
import VoiceControls from '../components/VoiceControls';
import { initSocket } from '../socket';
import ACTIONS from '../Actions';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';
import '../App.css';
import toast from 'react-hot-toast';

const EditorPage = () => {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();
  const [clients, setClients] = useState([]);
  const [socketReady, setSocketReady] = useState(false);

  const {
    inVoice,
    isMuted,
    voiceUsers,
    joinVoice,
    leaveVoice,
    toggleMute,
    getVoiceState,
    cleanupVoice,
  } = useVoiceChat(socketRef, roomId, socketReady);

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on('connect_error', (err) => handleErrors(err));
      socketRef.current.on('connect_failed', (err) => handleErrors(err));

      function handleErrors(e) {
        console.log('socket error', e);
        toast.error('Socket connection failed, try again later.');
        reactNavigator('/');
      }

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      setSocketReady(true);

      //Listening for joined event
      socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
        if (username !== location.state?.username) {
          toast.success(`${username} joined the room.`);
          socketRef.current.emit(ACTIONS.SYNC_CODE, {
            code: codeRef.current,
            socketId,
          });
        }
        setClients(clients);
      });
      //Listening for disconnected event
      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room.`);
        setClients((prev) => {
          return prev.filter(client => client.socketId !== socketId);
        })
      })
    };
    init();

    return () => {
      setSocketReady(false);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.off(ACTIONS.JOINED);
        socketRef.current.off(ACTIONS.DISCONNECTED);
      }
    }
  }, [roomId, location.state?.username, reactNavigator]);

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success('Room ID has been copied to clipboard');
    }catch (err) {
      toast.error('Could not copy the Room ID');
      console.error(err);
    }
  }
  function leaveRoom() {
    if (inVoice) {
      cleanupVoice();
      socketRef.current?.emit(ACTIONS.VOICE_LEAVE, { roomId });
    }
    reactNavigator('/');
  }


  if (!location.state) {
    return <Navigate to="/" />
  }
  return <div className="mainWrap">
    <div className="aside">
      <div className="asideInner">
        <div className="logo">
          <img className='logoImage' src="/CodeWeave.png" alt="CodeWeave Logo" />
          <h3>Connected</h3>
          <div className="clientsList">
            {
              clients.map((client) => {
                const voiceState = getVoiceState(client.socketId);
                return (
                  <Client
                    key={client.socketId}
                    username={client.username}
                    inVoice={voiceState.inVoice}
                    isMuted={voiceState.isMuted}
                    isSpeaking={voiceState.isSpeaking}
                  />
                );
              })
            }
          </div>
        </div>
      </div>
      <VoiceControls
        inVoice={inVoice}
        isMuted={isMuted}
        voiceCount={voiceUsers.length}
        onJoin={joinVoice}
        onLeave={leaveVoice}
        onToggleMute={toggleMute}
      />
      <button className='btn copyBtn' onClick={copyRoomId}>Copy ROOM ID</button>
      <button className='btn leaveBtn' onClick={leaveRoom}>Leave</button>
    </div>
    <div className="editorWrap">
      <Editor socketRef={socketRef} roomId={roomId} onCodeChange={(code)=>{
        codeRef.current = code;
      }} />
    </div>
  </div>
}

export default EditorPage
