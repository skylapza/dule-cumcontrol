// แก้ไข script.js โดยใช้ ID ปุ่มที่ตรงกับ HTML ล่าสุด และแทน alert ด้วย messageBox พร้อมรองรับ WebRTC และออกห้อง

window.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // ✅ ดึง room และ role จาก URL อย่างถูกต้อง
    const urlParams = new URLSearchParams(window.location.search);
    let myRoom = urlParams.get('room');
    let myRole = urlParams.get('role');

    let peerConnection;
    let localStream;

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const gameStatusElement = document.getElementById('gameStatus');
    const arousalBar = document.getElementById('arousalBar');
    const messageBox = document.getElementById('messageBox');

    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    };

    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) {
                localVideo.srcObject = localStream;
            }
            return localStream;
        } catch (error) {
            console.error('Error accessing media devices.', error);
            showMessage('ไม่สามารถเข้าถึงกล้องและไมโครโฟนได้!');
            return null;
        }
    }

    function stopLocalStream() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            if (localVideo) {
                localVideo.srcObject = null;
            }
        }
    }

    function createPeerConnection(room, role) {
        peerConnection = new RTCPeerConnection(rtcConfig);

        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }

        peerConnection.ontrack = (event) => {
            if (remoteVideo && event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { room: room, candidate: event.candidate });
            }
        };
    }

    const bindMasterControls = () => {
        const commandButtons = [
            { id: 'masterOkBtn', command: 'ok' },
            { id: 'masterNoBtn', command: 'no-cum' },
            { id: 'masterNowBtn', command: 'now' },
            { id: 'masterDontTouchBtn', command: 'dont-touch' },
            { id: 'speedUpBpmBtn', command: 'speed-up' },
            { id: 'speedDownBpmBtn', command: 'speed-down' },
            { id: 'stopBpmBtn', command: 'stop' },
        ];

        commandButtons.forEach(({ id, command }) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    socket.emit('masterCommand', { room: myRoom, type: command });
                    console.log(`[MASTER] Command sent: ${command}`);
                });
            }
        });
    };

    socket.on('masterCommand', ({ type }) => {
        console.log(`[PLAYER] คำสั่งที่ได้รับจาก Master: ${type}`);
        switch (type) {
            case 'ok': showMessage('Master: OK'); break;
            case 'no-cum': showMessage('Master: ห้ามแตก!'); break;
            case 'stop': showMessage('Master: สั่งให้หยุด'); break;
            default: console.log('Unknown command:', type);
        }
    });

    if (arousalBar) {
        arousalBar.addEventListener('input', () => {
            const level = parseInt(arousalBar.value);
            socket.emit('playerArousalUpdate', level);
        });
    }

    socket.on('playerArousalUpdate', (level) => {
        const bar = document.getElementById('arousalBar');
        if (bar) {
            bar.value = level;
            console.log(`[MASTER] อัปเดตระดับ arousal: ${level}`);
        }
    });

    socket.on('signal', async (data) => {
        if (!peerConnection) {
            createPeerConnection(myRoom, myRole);
        }
        if (data.description) {
            await peerConnection.setRemoteDescription(data.description);
            if (data.description.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', { room: myRoom, description: answer });
            }
        } else if (data.candidate) {
            try {
                await peerConnection.addIceCandidate(data.candidate);
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        }
    });

    socket.on('startWebRTC', async ({ room, role }) => {
        myRoom = room;
        myRole = role;
        await startLocalStream();
        createPeerConnection(room, role);

        if (role === 'player') {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { room: room, description: offer });
        }
    });

    socket.on('partnerDisconnected', (msg) => {
        showMessage(msg);
        setTimeout(() => window.location.href = '/lobby.html', 3000);
    });

    function showMessage(text) {
        if (messageBox) {
            messageBox.textContent = text;
            messageBox.style.display = 'block';
            setTimeout(() => messageBox.style.display = 'none', 3000);
        } else {
            alert(text);
        }
    }

    bindMasterControls();
});
