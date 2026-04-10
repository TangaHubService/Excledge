import { Server, Socket } from 'socket.io';

let io: Server;

export const initSocket = (server: any) => {
    console.log('Socket.io initialized');
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL, // Match your frontend URL
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    io.on("connection", (socket: Socket) => {
        console.log("Client connected:", socket.id);

        // Client joins an organization room for notifications
        socket.on("joinOrganization", (data: { organizationId: string }, callback?: () => void) => {
            if (!data?.organizationId) {
                console.warn("No organizationId provided for joinOrganization");
                return;
            }
            const roomName = `org-${data.organizationId}`;
            console.log(`Joining organization room: ${roomName}, Socket ID: ${socket.id}`);
            socket.join(roomName);
            if (typeof callback === 'function') {
                callback();
            }
        });

        // Client joins a transaction room
        socket.on("joinTransaction", (data: { ref: string }, callback?: () => void) => {
            if (!data?.ref) {
                console.warn("No ref provided for joinTransaction");
                return;
            }
            const roomName = `trx-${data.ref}`;
            console.log(`Joining room: ${roomName}, Socket ID: ${socket.id}`);
            socket.join(roomName);
            if (typeof callback === 'function') {
                callback();
            }
        });

        socket.on("disconnect", (reason) => {
            console.log("Client disconnected:", socket.id, "Reason:", reason);
        });

        // Handle any connection errors
        socket.on("error", (error) => {
            console.error("Socket error:", error);
        });
    });

    // Handle server-level errors
    io.engine.on("connection_error", (err) => {
        console.error("Socket connection error:", err);
    });

    return io;
}

export const getIO = (): Server => {
    if (!io) {
        throw new Error("Socket.io not initialized! Call initSocket() first.");
    }
    return io;
}

export const emitTransactionUpdate = (ref: string, data: any, organizationId: string) => {
    try {
        const io = getIO();
        const transactionRoom = `trx-${ref}`;
        const organizationRoom = `org-${organizationId}`;

        console.log(`📢 Emitting 'transactionUpdate' to room ${transactionRoom}`);
        io.to(transactionRoom).emit('transactionUpdate', data);

        console.log(`📢 Emitting 'transactionUpdate' to room ${organizationRoom}`);
        io.to(organizationRoom).emit('transactionUpdate', data);

    } catch (error) {
        console.error("Failed to emit transaction update:", error);
    }
};
