// script.js - WebRTC + Socket.IO client logic with role awareness
window.addEventListener('DOMContentLoaded', async () => {
  const socket = io();

  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  const role = urlParams.get('role');

  let localStream;
  let peerConnection;
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');

  async function startLocalStream() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      console.error('📛 Error getting media:', err);
    }
  }

  async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    peerConnection.ontrack = event => {
      if (remoteVideo) remoteVideo.srcObject = event.streams[0];
    };
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('ice-candidate', { roomId, candidate: event.candidate });
      }
    };
  }

  socket.emit('join-room', { roomId, role });

  socket.on('ready', async () => {
    if (role === 'master') {
      await createPeerConnection();
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { roomId, offer });
    }
  });

  socket.on('offer', async offer => {
    if (role === 'player') {
      await createPeerConnection();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', { roomId, answer });
    }
  });

  socket.on('answer', async answer => {
    if (role === 'master') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  socket.on('ice-candidate', async candidate => {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('📛 Error adding ICE candidate:', err);
    }
  });

  await startLocalStream();
});
