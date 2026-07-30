import type { Node } from "./Node.ts";

export interface NodeSelector {
  pick(nodes: Node[], guildId: string): Node | null;
}

export class LeastUsedSelector implements NodeSelector {
  public pick(nodes: Node[], _guildId: string): Node | null {
    if (nodes.length === 0) return null;
    const connected = nodes.filter((n) => n.state === "connected");
    if (connected.length === 0) return null;

    let best = connected[0] as Node;
    let minPlayers = best.playerCount;

    for (let i = 1; i < connected.length; i++) {
      const node = connected[i] as Node;
      if (node.playerCount < minPlayers) {
        best = node;
        minPlayers = node.playerCount;
      }
    }

    return best;
  }
}

export class LeastPenaltySelector implements NodeSelector {
  public pick(nodes: Node[], _guildId: string): Node | null {
    if (nodes.length === 0) return null;
    const connected = nodes.filter((n) => n.state === "connected");
    if (connected.length === 0) return null;

    let best = connected[0] as Node;
    let minPenalty = best.penalties.total;

    for (let i = 1; i < connected.length; i++) {
      const node = connected[i] as Node;
      const penalty = node.penalties.total;
      if (penalty < minPenalty) {
        best = node;
        minPenalty = penalty;
      }
    }

    return best;
  }
}

export class RoundRobinSelector implements NodeSelector {
  private index = 0;

  public pick(nodes: Node[], _guildId: string): Node | null {
    if (nodes.length === 0) return null;
    const connected = nodes.filter((n) => n.state === "connected");
    if (connected.length === 0) return null;

    this.index = this.index % connected.length;
    const selected = connected[this.index] as Node;
    this.index = (this.index + 1) % connected.length;

    return selected;
  }

  public reset(): void {
    this.index = 0;
  }
}

export class RandomSelector implements NodeSelector {
  public pick(nodes: Node[], _guildId: string): Node | null {
    if (nodes.length === 0) return null;
    const connected = nodes.filter((n) => n.state === "connected");
    if (connected.length === 0) return null;

    const index = Math.floor(Math.random() * connected.length);
    return connected[index] as Node;
  }
}
