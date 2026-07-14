import { useCallback, useEffect, useRef, useState } from 'react';
import ACTIONS from '../Actions';
import toast from 'react-hot-toast';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function shouldInitiate(mySocketId, remoteSocketId) {
  return mySocketId < remoteSocketId;
}

export function useVoiceChat(socketRef, roomId, socketReady) {
  const [inVoice, setInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef(new Map());
  const analysersRef = useRef(new Map());
  const animationFrameRef = useRef(null);
  const inVoiceRef = useRef(false);
  const isMutedRef = useRef(false);
  const mySocketIdRef = useRef(null);

  inVoiceRef.current = inVoice;
  isMutedRef.current = isMuted;

  const removePeer = useCallback((socketId) => {
    const pc = peersRef.current.get(socketId);
    if (pc) {
      pc.close();
      peersRef.current.delete(socketId);
    }

    const audio = audioElementsRef.current.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      audioElementsRef.current.delete(socketId);
    }

    analysersRef.current.delete(socketId);
    setSpeakingUsers((prev) => {
      const next = new Set(prev);
      next.delete(socketId);
      return next;
    });
  }, []);

  const setupAnalyser = useCallback((socketId, stream) => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analysersRef.current.set(socketId, { analyser, audioContext });
    } catch {
      // Audio analysis is optional
    }
  }, []);

  const createPeerConnection = useCallback(async (remoteSocketId, isInitiator) => {
    if (peersRef.current.has(remoteSocketId)) {
      return peersRef.current.get(remoteSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const socket = socketRef.current;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit(ACTIONS.VOICE_ICE_CANDIDATE, {
          to: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let audio = audioElementsRef.current.get(remoteSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        document.body.appendChild(audio);
        audioElementsRef.current.set(remoteSocketId, audio);
      }
      audio.srcObject = event.streams[0];
      setupAnalyser(remoteSocketId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    peersRef.current.set(remoteSocketId, pc);

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit(ACTIONS.VOICE_OFFER, { to: remoteSocketId, offer });
    }

    return pc;
  }, [socketRef, setupAnalyser]);

  const connectToVoiceUsers = useCallback(async (users) => {
    const mySocketId = mySocketIdRef.current;
    if (!mySocketId || !inVoiceRef.current) return;

    const remoteIds = users
      .map((u) => u.socketId)
      .filter((id) => id !== mySocketId);

    const currentIds = new Set(peersRef.current.keys());
    const targetIds = new Set(remoteIds);

    currentIds.forEach((id) => {
      if (!targetIds.has(id)) removePeer(id);
    });

    for (const remoteSocketId of remoteIds) {
      if (!peersRef.current.has(remoteSocketId)) {
        const isInitiator = shouldInitiate(mySocketId, remoteSocketId);
        await createPeerConnection(remoteSocketId, isInitiator);
      }
    }
  }, [createPeerConnection, removePeer]);

  const detectSpeaking = useCallback(() => {
    const threshold = 15;
    const speaking = new Set();

    analysersRef.current.forEach(({ analyser }, socketId) => {
      if (socketId === 'local') return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, val) => sum + val, 0) / data.length;
      if (average > threshold) {
        speaking.add(socketId);
      }
    });

    if (inVoiceRef.current && !isMutedRef.current && localStreamRef.current) {
      const localAnalyser = analysersRef.current.get('local');
      if (localAnalyser) {
        const data = new Uint8Array(localAnalyser.analyser.frequencyBinCount);
        localAnalyser.analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, val) => sum + val, 0) / data.length;
        if (average > threshold) {
          speaking.add(mySocketIdRef.current);
        }
      }
    }

    setSpeakingUsers(speaking);
    animationFrameRef.current = requestAnimationFrame(detectSpeaking);
  }, []);

  const cleanupVoice = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    peersRef.current.forEach((_, socketId) => removePeer(socketId));
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    const localAnalyser = analysersRef.current.get('local');
    if (localAnalyser) {
      localAnalyser.audioContext.close();
      analysersRef.current.delete('local');
    }

    setSpeakingUsers(new Set());
    setInVoice(false);
    setIsMuted(false);
  }, [removePeer]);

  const joinVoice = useCallback(async () => {
    if (inVoiceRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      mySocketIdRef.current = socketRef.current?.id;

      setupAnalyser('local', stream);

      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(detectSpeaking);
      }

      setInVoice(true);
      socketRef.current?.emit(ACTIONS.VOICE_JOIN, { roomId });
      toast.success('Joined voice chat');
    } catch (err) {
      console.error('Microphone access error:', err);
      toast.error('Could not access microphone. Check permissions.');
    }
  }, [socketRef, roomId, setupAnalyser, detectSpeaking]);

  const leaveVoice = useCallback(() => {
    if (!inVoiceRef.current) return;

    socketRef.current?.emit(ACTIONS.VOICE_LEAVE, { roomId });
    cleanupVoice();
    toast.success('Left voice chat');
  }, [socketRef, roomId, cleanupVoice]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const newMuted = !isMutedRef.current;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !newMuted;
    });

    setIsMuted(newMuted);
    socketRef.current?.emit(ACTIONS.VOICE_MUTE_STATE, { roomId, isMuted: newMuted });
  }, [socketRef, roomId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socketReady) return;

    const onVoiceJoin = ({ voiceUsers: users }) => {
      setVoiceUsers(users || []);
      if (inVoiceRef.current) {
        connectToVoiceUsers(users || []);
      }
    };

    const onVoiceOffer = async ({ from, offer }) => {
      if (!inVoiceRef.current) return;

      let pc = peersRef.current.get(from);
      if (!pc) {
        pc = await createPeerConnection(from, false);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit(ACTIONS.VOICE_ANSWER, { to: from, answer });
    };

    const onVoiceAnswer = async ({ from, answer }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const onVoiceIceCandidate = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('ICE candidate error:', err);
        }
      }
    };

    const onJoined = ({ voiceUsers: users }) => {
      if (users) {
        setVoiceUsers(users);
      }
    };

    const onDisconnected = ({ socketId }) => {
      removePeer(socketId);
      setVoiceUsers((prev) => prev.filter((u) => u.socketId !== socketId));
    };

    socket.on(ACTIONS.VOICE_JOIN, onVoiceJoin);
    socket.on(ACTIONS.VOICE_OFFER, onVoiceOffer);
    socket.on(ACTIONS.VOICE_ANSWER, onVoiceAnswer);
    socket.on(ACTIONS.VOICE_ICE_CANDIDATE, onVoiceIceCandidate);
    socket.on(ACTIONS.JOINED, onJoined);
    socket.on(ACTIONS.DISCONNECTED, onDisconnected);

    return () => {
      socket.off(ACTIONS.VOICE_JOIN, onVoiceJoin);
      socket.off(ACTIONS.VOICE_OFFER, onVoiceOffer);
      socket.off(ACTIONS.VOICE_ANSWER, onVoiceAnswer);
      socket.off(ACTIONS.VOICE_ICE_CANDIDATE, onVoiceIceCandidate);
      socket.off(ACTIONS.JOINED, onJoined);
      socket.off(ACTIONS.DISCONNECTED, onDisconnected);
    };
  }, [socketRef, socketReady, connectToVoiceUsers, createPeerConnection, removePeer]);

  useEffect(() => {
    return () => {
      if (inVoiceRef.current) {
        socketRef.current?.emit(ACTIONS.VOICE_LEAVE, { roomId });
      }
      cleanupVoice();
    };
  }, [socketRef, roomId, cleanupVoice]);

  const getVoiceState = useCallback((socketId) => {
    const user = voiceUsers.find((u) => u.socketId === socketId);
    return {
      inVoice: !!user,
      isMuted: user?.isMuted ?? false,
      isSpeaking: speakingUsers.has(socketId),
    };
  }, [voiceUsers, speakingUsers]);

  return {
    inVoice,
    isMuted,
    voiceUsers,
    joinVoice,
    leaveVoice,
    toggleMute,
    getVoiceState,
    cleanupVoice,
  };
}
