import React from 'react';

const VoiceControls = ({ inVoice, isMuted, voiceCount, onJoin, onLeave, onToggleMute }) => {
  return (
    <div className="voiceControls">
      <h3>Voice Chat</h3>
      {!inVoice ? (
        <button className="btn voiceJoinBtn" onClick={onJoin}>
          <span className="voiceIcon">🎤</span>
          Join Voice
        </button>
      ) : (
        <div className="voiceActiveControls">
          <span className="voiceStatus">
            <span className="voicePulse" />
            Live · {voiceCount} in call
          </span>
          <div className="voiceBtnGroup">
            <button
              className={`btn voiceMuteBtn ${isMuted ? 'muted' : ''}`}
              onClick={onToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎙️'}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button className="btn voiceLeaveBtn" onClick={onLeave}>
              Leave Voice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceControls;
