import React from 'react'
import Avatar from 'react-avatar';

const Client = ({ username, inVoice, isMuted, isSpeaking }) => {
  return (
    <div className={`client ${inVoice ? 'inVoice' : ''} ${isSpeaking ? 'speaking' : ''}`}>
        <div className="avatarWrap">
          <Avatar name={username} size={50} round="14px" />
          {inVoice && (
            <span className={`voiceBadge ${isMuted ? 'muted' : 'active'}`}>
              {isMuted ? '🔇' : '🎙️'}
            </span>
          )}
          {isSpeaking && <span className="speakingRing" />}
        </div>
        <span className='username'>{username}</span>
    </div>
  )
}

export default Client
