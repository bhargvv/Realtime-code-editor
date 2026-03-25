import React, { useState, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { dracula } from '@uiw/codemirror-theme-dracula';
import ACTIONS from '../Actions';
import '../App.css';

const Editor = ({ onCodeChange, socketRef, roomId }) => {
  const [value, setValue] = useState("");
  // We use a ref to distinguish between user typing and incoming socket events 
  // so we don't accidentally emit socket events back when we receive them.
  const isInternalChange = useRef(false);
  
  const onChange = React.useCallback((val, viewUpdate) => {
    setValue(val);
    
    // Pass the changes back to EditorPage if needed
    if (onCodeChange) {
      onCodeChange(val);
    }

    // Only emit to socket if the change was from the user typing
    if (!isInternalChange.current) {
      if (socketRef && socketRef.current && roomId) {
        socketRef.current.emit(ACTIONS.CODE_CHANGE, {
          roomId,
          code: val,
        });
      }
    }
    
    // Reset the internal change flag
    isInternalChange.current = false;
  }, [onCodeChange, socketRef, roomId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Listen for incoming code from other users
    const handleCodeChange = ({ code }) => {
      if (onCodeChange) {
        onCodeChange(code);
      }
      if (code !== null) {
        isInternalChange.current = true; // Mark as internal so we don't echo it back
        setValue(code);
      }
    };

    socket.on(ACTIONS.CODE_CHANGE, handleCodeChange);
    socket.on(ACTIONS.SYNC_CODE, handleCodeChange);

    return () => {
      socket.off(ACTIONS.CODE_CHANGE, handleCodeChange);
      socket.off(ACTIONS.SYNC_CODE, handleCodeChange);
    };
  }, [socketRef, onCodeChange]);

  return (
    <CodeMirror
      value={value}
      height="100vh"
      theme={dracula}
      extensions={[javascript({ jsx: true })]}
      onChange={onChange}
    />
  );
}

export default Editor;
