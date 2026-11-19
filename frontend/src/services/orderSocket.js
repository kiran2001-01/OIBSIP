import { io } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const socketUrl = new URL(apiUrl, window.location.origin).origin;

export const connectOrderSocket = () =>
  io(socketUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling']
  });
