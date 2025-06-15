const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const status = document.getElementById('status');
const roleBox = document.getElementById('role');
const controls = document.getElementById('controls');

let peer;
let myRole;
let myRoom;

socket.on('waiting', () => {
  status.innerText = '🕐 รอผู้เล่นอีกคน...';
});

socket.on('paired', async ({ role, room }) => {
  myRole = role;
  myRoom = room;
  roleBox.innerText = role;
  controls.style.display = 'block';
  status.innerText = '🔗 จับคู่สำเร็จ!';

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  localVideo.srcObject = stream;

  peer = new RTCPeerConnection();

  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  peer.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { room: myRoom, candidate: event.candidate });
    }
  };

  if (role === 'master') {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('signal', { room: myRoom, sdp: offer });
  }
});

socket.on('signal', async (data) => {
  if (data.sdp) {
    await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === 'offer') {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('signal', { room: myRoom, sdp: answer });
    }
  } else if (data.candidate) {
    peer.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

function sendCommand(cmd) {
  alert(`ส่งคำสั่ง: ${cmd}`);
}
