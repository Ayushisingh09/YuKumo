import { Node } from "./Node.ts";
import type { NodeSelector } from "./NodeSelector.ts";
import { LeastUsedSelector } from "./NodeSelector.ts";
import type { NodeConfig } from "../types/internal.ts";

export class NodeManager {
  private readonly nodes = new Map<string, Node>();
  private readonly userId: string;
  private selector: NodeSelector;

  public constructor(userId: string, selector?: NodeSelector) {
    this.userId = userId;
    this.selector = selector ?? new LeastUsedSelector();
  }

  public setUserId(userId: string): void {
    (this as any).userId = userId;
    for (const node of this.nodes.values()) {
      node.setUserId(userId);
    }
  }

  public setSelector(selector: NodeSelector): void {
    this.selector = selector;
  }

  public add(config: NodeConfig): Node {
    const id = config.name ?? `${config.host}:${config.port}`;
    if (this.nodes.has(id)) {
      throw new Error(`Node "${id}" already exists`);
    }

    const node = new Node(config, this.userId);
    this.nodes.set(id, node);
    return node;
  }

  public remove(id: string): boolean {
    const node = this.nodes.get(id);
    if (node === undefined) return false;

    node.destroy();
    this.nodes.delete(id);
    return true;
  }

  public get(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  public getAll(): Node[] {
    return Array.from(this.nodes.values());
  }

  public getConnected(): Node[] {
    return this.getAll().filter((n) => n.state === "connected");
  }

  public async connectAll(): Promise<void> {
    const promises = Array.from(this.nodes.values()).map((node) =>
      node.connect().catch(() => {
        // individual node failures are handled via events
      }),
    );
    await Promise.all(promises);
  }

  public async destroyAll(): Promise<void> {
    const nodes = this.getAll();
    this.nodes.clear();
    await Promise.all(nodes.map((n) => n.close()));
  }

  public pick(guildId: string): Node | null {
    const nodes = this.getAll();
    return this.selector.pick(nodes, guildId);
  }

  public size(): number {
    return this.nodes.size;
  }
}
