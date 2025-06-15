const socket = io(); // เชื่อมต่อ Socket.IO

// ตัวแปรสำหรับ WebRTC
let peerConnection;
let localStream;
let myRole;
let myRoom;

// Elements จาก DOM (ควรมีอยู่ใน player_game.html และ master_control.html)
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
// อาจจะต้องเพิ่ม element สำหรับแสดงสถานะการเชื่อมต่อ/จับคู่ในหน้าเกม
const gameStatusElement = document.getElementById('gameStatus'); // สมมติว่ามี element นี้

// Config สำหรับ WebRTC (ใช้ Google STUN servers)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // สามารถเพิ่ม TURN servers ได้หากต้องการสำหรับการเชื่อมต่อผ่าน NAT ที่ซับซ้อน
    ]
};

// **********************************************
// ฟังก์ชันสำหรับ WebRTC
// **********************************************

// เริ่มต้น Local Media (กล้อง/ไมค์)
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); // เปิดทั้งวิดีโอและเสียง
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
        console.log('Got local stream:', localStream);
        return localStream;
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert('ไม่สามารถเข้าถึงกล้องและไมโครโฟนได้! โปรดตรวจสอบสิทธิ์');
        return null;
    }
}

// หยุด Local Media Stream
function stopLocalStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        if (localVideo) {
            localVideo.srcObject = null;
        }
        console.log('Local stream stopped.');
    }
}

// สร้าง Peer Connection
function createPeerConnection(room, role) {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // เพิ่ม Local Stream เข้า Peer Connection
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // เมื่อได้รับ Remote Stream
    peerConnection.ontrack = (event) => {
        if (remoteVideo && event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            console.log('Received remote stream.');
            // ตรวจสอบว่ามี stream แล้วค่อยแสดงผล
            if (remoteVideo.style.display === 'none') {
                 remoteVideo.style.display = 'block'; // แสดงวิดีโอเมื่อได้รับ stream
            }
        }
    };

    // เมื่อได้รับ ICE Candidate (สำหรับ NAT traversal)
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // ส่ง ICE Candidate ไปยังคู่ผ่าน Socket.IO
            console.log('Sending ICE candidate:', event.candidate);
            socket.emit('signal', { room: room, candidate: event.candidate });
        }
    };

    // เมื่อสถานะการเชื่อมต่อเปลี่ยนไป
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        if (gameStatusElement) {
            gameStatusElement.textContent = `สถานะการเชื่อมต่อ: ${peerConnection.iceConnectionState}`;
        }
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
            console.log('Peer connection disconnected or failed.');
            // อาจจะแจ้งเตือนผู้ใช้หรือพยายามเชื่อมต่อใหม่
            // alert('การเชื่อมต่อกับคู่หลุด! โปรดลองโหลดหน้าใหม่');
            // window.location.href = '/lobby.html'; // พาผู้ใช้กลับ Lobby
        }
    };

    // เมื่อสถานะการ Signaling เปลี่ยนไป
    peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
    };

    return peerConnection;
}

// ปิด Peer Connection
function closePeerConnection() {
    if (peerConnection) {
        console.log('Closing peer connection.');
        peerConnection.close();
        peerConnection = null;
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.style.display = 'none'; // ซ่อนวิดีโอคู่
    }
}


// **********************************************
// Socket.IO Events
// **********************************************

// เมื่อ Client เชื่อมต่อ Socket.IO
socket.on('connect', async () => {
    console.log('Connected to socket.io server. Socket ID:', socket.id);
    // หากอยู่ในหน้าเกม (player_game.html หรือ master_control.html)
    // และมีการโหลดหน้านี้ขึ้นมาใหม่ อาจจะต้อง re-join room หรือรอลั่น
    // เราจะใช้ URL parameters เพื่อระบุห้องและบทบาท
    const urlParams = new URLSearchParams(window.location.search);
    myRoom = parseInt(urlParams.get('room'));
    const roleParam = urlParams.get('role'); // ต้องมีใน URL หากต้องการให้ client รู้บทบาทเมื่อโหลดหน้าเกม

    // หากโหลดหน้านี้โดยตรงด้วย parameter ห้องและบทบาท
    if (myRoom && roleParam) {
        myRole = roleParam; // กำหนดบทบาท
        console.log(`Reconnecting as ${myRole} in Room ${myRoom}`);
        // อาจจะต้องส่งสัญญาณ 'rejoinGame' ไปเซิร์ฟเวอร์เพื่อให้เซิร์ฟเวอร์ตรวจสอบสถานะและส่ง 'paired' กลับมาใหม่
        // แต่ในตอนนี้เราจะพึ่งพา server.js ในการ 'redirect' เพื่อเริ่มเกมใหม่เมื่อคู่เชื่อมต่อ
        // และ 'partnerDisconnected' เพื่อกลับ Lobby
    }
});


// ** IMPORTANT: เหตุการณ์ 'paired' นี้จะถูกส่งมาจาก Server
//    เมื่อผู้เล่นทั้งสองฝั่งกดยืนยัน 'พร้อม' และเซิร์ฟเวอร์สั่ง redirect มายังหน้านี้
socket.on('paired', async ({ room, role, partnerId, partnerRole }) => {
    console.log(`Paired! You are ${role} in Room ${room}. Partner is ${partnerRole} (${partnerId}).`);
    myRoom = room;
    myRole = role;

    // อัปเดต UI ในหน้าเกม
    if (gameStatusElement) {
        gameStatusElement.textContent = `จับคู่สำเร็จ! คุณคือ ${role} ในห้อง ${room}`;
    }
    // ตัวอย่างการแสดงบทบาทในหน้า Player/Master
    const roleDisplayElement = document.getElementById('roleDisplay'); // สมมติว่ามี element นี้
    if (roleDisplayElement) {
        roleDisplayElement.textContent = `บทบาท: ${role}`;
    }

    // เริ่มต้น Peer Connection และ Stream
    await startLocalStream(); // เริ่มต้นกล้อง/ไมค์ก่อน
    if (localStream) {
        createPeerConnection(myRoom, myRole);

        // ถ้าเป็น Master, สร้าง Offer ก่อน
        if (myRole === 'master') {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Sending offer from Master:', offer);
            socket.emit('signal', { room: myRoom, sdp: offer });
        }
    } else {
        console.error('Local stream not available. Cannot establish WebRTC.');
        alert('ไม่สามารถเริ่มการสนทนาด้วยวิดีโอได้: ไม่สามารถเข้าถึงกล้องได้');
    }
});

// การจัดการสัญญาณ WebRTC (SDP and ICE Candidates)
socket.on('signal', async (data) => {
    if (!peerConnection) {
        console.warn('Received signal but peerConnection is not initialized. Initializing...');
        // กรณีที่ได้รับสัญญาณก่อนที่ PeerConnection จะถูกสร้าง (เช่น โหลดหน้าช้า)
        // ควรสร้าง PeerConnection และ localStream ก่อน
        await startLocalStream();
        if (localStream) {
            createPeerConnection(myRoom, myRole);
        } else {
            console.error('Cannot create peer connection: Local stream not available.');
            return;
        }
    }

    if (data.sdp) {
        // ถ้าเป็น SDP (Session Description Protocol)
        console.log('Received SDP:', data.sdp.type);
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

            if (data.sdp.type === 'offer') {
                // ถ้าเป็น Offer, สร้าง Answer กลับไป
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('Sending answer:', answer);
                socket.emit('signal', { room: myRoom, sdp: answer });
            }
        } catch (error) {
            console.error('Error setting remote description or creating answer:', error);
        }
    } else if (data.candidate) {
        // ถ้าเป็น ICE Candidate
        console.log('Received ICE candidate:', data.candidate);
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error('Error adding received ICE candidate:', error);
        }
    }
});

// เมื่อคู่หลุดการเชื่อมต่อ
socket.on('partnerDisconnected', (message) => {
    alert(message + "\nคุณจะถูกนำกลับไปยังล็อบบี้");
    closePeerConnection(); // ปิด WebRTC Connection
    stopLocalStream(); // หยุดกล้อง/ไมค์
    // Server จะเป็นผู้สั่ง redirect กลับ lobby
    // window.location.href = '/lobby.html'; // ไม่จำเป็นเพราะ server จะ redirect ให้
});

// เมื่อ Client ถูกตัดการเชื่อมต่อจากเซิร์ฟเวอร์ (อาจเกิดจากเซิร์ฟเวอร์รีสตาร์ท)
socket.on('disconnect', () => {
    console.log('Disconnected from socket.io server.');
    closePeerConnection(); // ปิด WebRTC Connection
    stopLocalStream(); // หยุดกล้อง/ไมค์
    // alert('คุณถูกตัดการเชื่อมต่อจากเซิร์ฟเวอร์! โปรดลองโหลดหน้าใหม่');
    // window.location.href = '/lobby.html'; // หรือจะให้ไปหน้าแรกก็ได้
});

// **********************************************
// ส่วนของ Logic เกม (ที่คุณมีอยู่แล้ว)
// **********************************************

// **หมายเหตุ:** โค้ดด้านล่างนี้คือส่วนของ Logic เกมเดิมของคุณที่ควรจะยังคงทำงานอยู่
// คุณจะต้องแน่ใจว่ามันถูกเรียกใช้เมื่อเกมเริ่ม
// และตัวแปร global ที่ใช้ในโค้ดเหล่านี้ถูกประกาศไว้ในไฟล์นี้ หรือใน player_game.html/master_control.html
// เช่น currentBPM, playerArousalLevel, masterElapsedTimeInterval ฯลฯ

// ตัวอย่างการใช้งาน:
// ตรวจสอบว่า element 'startMasterGame' หรือ 'startPlayerGame' มีอยู่ใน DOM
// และผูก Event listener เพื่อเริ่มเกมเมื่อถูกคลิก
// ส่วนนี้ขึ้นอยู่กับว่าคุณต้องการให้ 'paired' event เริ่มเกมทันที
// หรือต้องมีการคลิกปุ่ม 'เริ่มเกม' ในหน้า player_game/master_control อีกครั้ง

// ตัวอย่างการส่งคำสั่งจาก Master ไป Player
// function sendCommandToPlayer(commandType, value) {
//     if (myRole === 'master' && myRoom && socket) {
//         socket.emit('masterCommand', { room: myRoom, type: commandType, value: value });
//     }
// }

// ตัวอย่างการส่ง Arousal จาก Player ไป Master
// function sendArousalUpdate(arousalLevel) {
//     if (myRole === 'player' && myRoom && socket) {
//         socket.emit('playerArousalUpdate', { room: myRoom, level: arousalLevel });
//     }
// }

// *** ควรมี Logic สำหรับเริ่มต้นเกมจริงเมื่อได้รับ signal 'paired' ***
// เช่น คุณอาจจะมีปุ่ม 'Start Game' ใน player_game.html/master_control.html
// ที่ถูกเปิดใช้งานเมื่อ 'paired' หรือเกมเริ่มอัตโนมัติ
// และเริ่ม WebRTC Connection ทันที
// ตัวอย่าง:
// document.addEventListener('DOMContentLoaded', () => {
//     // เช็คว่าอยู่ในหน้าเกมหรือไม่ โดยดูจาก URL params
//     const urlParams = new URLSearchParams(window.location.search);
//     const roomParam = urlParams.get('room');
//     const roleParam = urlParams.get('role');

//     if (roomParam && roleParam) {
//         myRoom = parseInt(roomParam);
//         myRole = roleParam;
//         // อาจจะต้อง emit 'rejoinGame' หรือรอ 'paired' จากเซิร์ฟเวอร์
//         // การเรียก startLocalStream และ createPeerConnection จะถูกจัดการใน socket.on('paired')
//     }
// });

// **********************************************
// ** ฟังก์ชันเก่าของคุณที่เกี่ยวข้องกับการควบคุมเกม **
// ** ให้คงไว้ หรือนำไปรวมใน script.js นี้ตามความเหมาะสม **
// ** หรือถ้าคุณแยกเป็นไฟล์อื่น ให้แน่ใจว่ามันสามารถเข้าถึงตัวแปร myRole, myRoom และ socket ได้ **
// **********************************************

// ส่วนนี้คือโค้ดที่คุณมีอยู่แล้ว เช่น
// player_game.html:
// const arousalBar = document.getElementById('arousalBar');
// function updateArousalDisplay() { ... }
// const strokeVisualizer = document.getElementById('strokeVisualizer');
// function animateStrokeVisualizer(bpm) { ... }
// socket.on('masterCommand', (data) => { ... });

// master_control.html:
// const masterArousalDisplay = document.getElementById('masterArousalDisplay');
// function updateMasterArousalDisplay(level) { ... }
// document.getElementById('allowBtn').addEventListener('click', () => { ... });
// socket.on('playerArousalUpdate', (arousalLevel) => { ... });

// คุณจะต้องตรวจสอบว่าฟังก์ชันและตัวแปรเหล่านี้ยังคงอยู่ในไฟล์ `player_game.html` และ `master_control.html`
// หรือถ้าคุณจะย้ายทั้งหมดมาที่ `script.txt` นี้ คุณต้องแน่ใจว่า elements ใน HTML มี `id` ที่ถูกต้องเพื่อให้ JavaScript เข้าถึงได้
// และฟังก์ชัน `startLocalStream`, `createPeerConnection`, `closePeerConnection`, `stopLocalStream`
// ถูกเรียกใช้ใน `socket.on('paired')` และ `socket.on('disconnect')` อย่างเหมาะสม
