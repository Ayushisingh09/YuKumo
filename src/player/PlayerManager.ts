import { Player } from "./Player.ts";
import type { PlayerOptions } from "./Player.ts";
import type { YuKumo } from "../Kumo.ts";

export class PlayerManager {
  private readonly players = new Map<string, Player>();
  private readonly kumo: YuKumo;

  public constructor(kumo: YuKumo) {
    this.kumo = kumo;
  }

  public create(options: Omit<PlayerOptions, "kumo">): Player {
    const existing = this.players.get(options.guildId);
    if (existing != null) {
      return existing;
    }

    const playerOptions: PlayerOptions = { ...options, kumo: this.kumo };
    const player = new Player(playerOptions);
    this.players.set(options.guildId, player);
    return player;
  }

  public get(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  public has(guildId: string): boolean {
    return this.players.has(guildId);
  }

  public async destroy(guildId: string): Promise<boolean> {
    const player = this.players.get(guildId);
    if (player === undefined) return false;

    await player.destroy();
    this.players.delete(guildId);
    return true;
  }

  public getAll(): Player[] {
    return Array.from(this.players.values());
  }

  public getByNode(nodeId: string): Player[] {
    return this.getAll().filter((p) => p.node.id === nodeId);
  }

  public async destroyAll(): Promise<void> {
    const promises = Array.from(this.players.entries()).map(async ([guildId]) => {
      await this.destroy(guildId);
    });
    await Promise.all(promises);
  }

  public size(): number {
    return this.players.size;
  }
}
