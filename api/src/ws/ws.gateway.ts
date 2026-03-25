import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PropagationService } from 'src/graph/services/propagation.service';
import { CriticalPathService } from 'src/graph/services/critical-path.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);

  constructor(
    private readonly propagationService: PropagationService,
    private readonly criticalPathService: CriticalPathService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connecte: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client deconnecte: ${client.id}`);
  }

  // Client sends move-preview during drag (throttled 60ms client-side)
  @SubscribeMessage('of:move-preview')
  handleMovePreview(
    @MessageBody() data: { requestId: number; ofId: string; newDateDebut: string },
    @ConnectedSocket() client: Socket,
  ) {
    const preview = this.propagationService.propagatePreview(data.ofId, data.newDateDebut);
    // Return to the requesting client only (not broadcast)
    client.emit('of:move-preview-result', {
      requestId: data.requestId,
      impactedNodes: preview,
    });
  }

  // Client sends move-commit on drop
  @SubscribeMessage('of:move-commit')
  async handleMoveCommit(
    @MessageBody() data: { ofId: string; newDateDebut: string },
    @ConnectedSocket() client: Socket,
  ) {
    const propagation = await this.propagationService.propagateCommit(data.ofId, data.newDateDebut);
    const criticalPath = await this.criticalPathService.recalculate();

    // Broadcast to ALL clients (including sender)
    this.server.emit('graph:updated', {
      impactedNodes: propagation,
      timestamp: new Date().toISOString(),
    });

    this.server.emit('critical-path:changed', {
      criticalNodes: criticalPath.criticalNodes,
    });

    // Emit KPI update
    this.server.emit('kpi:updated', {
      timestamp: new Date().toISOString(),
    });
  }

  // Public methods for other services to emit events
  emitGraphUpdated(data: { impactedNodes: unknown[]; timestamp: string }) {
    this.server.emit('graph:updated', data);
  }

  emitAlertNew(alert: unknown) {
    this.server.emit('alert:new', alert);
  }

  emitAlertResolved(alertId: number) {
    this.server.emit('alert:resolved', { alertId });
  }

  emitKpiUpdated(kpis: unknown) {
    this.server.emit('kpi:updated', kpis);
  }

  emitAllocationChanged(data: unknown) {
    this.server.emit('allocation:changed', data);
  }
}
