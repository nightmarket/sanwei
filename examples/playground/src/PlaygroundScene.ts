import { AiPlugin, integrate, wander, type Agent } from "@nightmarket/sanwei/plugins/ai";
import { PhysicsPlugin } from "@nightmarket/sanwei/plugins/physics";
import { TimePlugin } from "@nightmarket/sanwei/plugins/time";
import { WeatherPlugin } from "@nightmarket/sanwei/plugins/weather";
import {
  BaseThreeWebGPUScene,
  Input,
  THREE,
} from "@nightmarket/sanwei/three-webgpu";

type Wanderer = {
  agent: Agent;
  mesh: THREE.Mesh;
  state: { angle: number };
};

export class PlaygroundScene extends BaseThreeWebGPUScene {
  private player = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffc14a })
  );
  private wanderers: Wanderer[] = [];
  private hud = document.querySelector("#hud");
  private velocityY = 0;
  private grounded = true;

  constructor() {
    super({});
  }

  async init() {
    await super.init();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.player.castShadow = true;
    this.player.position.set(0, 0.75, 0);
    this.scene.add(this.player);

    const ai = this.app.plugins.get(AiPlugin);
    if (ai) {
      for (let i = 0; i < 8; i++) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0x7ec8ff })
        );
        mesh.castShadow = true;
        const agent: Agent = {
          position: { x: (Math.random() - 0.5) * 16, y: 0.28, z: (Math.random() - 0.5) * 16 },
          velocity: { x: 0, y: 0, z: 1 },
          maxSpeed: 1.8,
          maxForce: 4,
        };
        mesh.position.set(agent.position.x, agent.position.y, agent.position.z);
        this.scene.add(mesh);
        const wanderer = { agent, mesh, state: { angle: Math.random() * Math.PI * 2 } };
        this.wanderers.push(wanderer);
        ai.addAgent(agent);
      }
    }

    await this.tryPhysics();
  }

  private async tryPhysics() {
    const physics = this.app.plugins.get(PhysicsPlugin);
    if (!physics?.world) return;

    physics.add(null, {
      type: "fixed",
      position: { x: 0, y: -0.25, z: 0 },
      colliders: [{ shape: "cuboid", parameters: [40, 0.25, 40] }],
    });

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xd96b6b })
      );
      mesh.castShadow = true;
      physics.add(
        { model: mesh },
        {
          type: "dynamic",
          position: { x: (i - 2.5) * 0.9, y: 3 + i * 0.4, z: -3 },
          colliders: [{ shape: "cuboid", parameters: [0.3, 0.3, 0.3] }],
        }
      );
    }
  }

  render() {
    const delta = this.app.ticker.deltaScaled;
    this.updatePlayer(delta);
    this.updateWanderers(delta);
    this.updateHud();

    const camera = this.app.cameras.getActiveCamera();
    if (camera) this.app.render(this.scene, camera);
  }

  private updatePlayer(delta: number) {
    const speed = 6;
    if (Input.isKeyDown("w") || Input.isKeyDown("ArrowUp")) this.player.position.z -= speed * delta;
    if (Input.isKeyDown("s") || Input.isKeyDown("ArrowDown")) this.player.position.z += speed * delta;
    if (Input.isKeyDown("a") || Input.isKeyDown("ArrowLeft")) this.player.position.x -= speed * delta;
    if (Input.isKeyDown("d") || Input.isKeyDown("ArrowRight")) this.player.position.x += speed * delta;

    if ((Input.isKeyDown(" ") || Input.isKeyDown("Space")) && this.grounded) {
      this.velocityY = 6;
      this.grounded = false;
    }
    this.velocityY -= 16 * delta;
    this.player.position.y += this.velocityY * delta;
    if (this.player.position.y <= 0.75) {
      this.player.position.y = 0.75;
      this.velocityY = 0;
      this.grounded = true;
    }
  }

  private updateWanderers(delta: number) {
    const force = { x: 0, y: 0, z: 0 };
    for (const wanderer of this.wanderers) {
      wander(force, wanderer.agent.velocity, wanderer.state);
      integrate(wanderer.agent, force, delta);
      wanderer.agent.position.x = Math.max(-18, Math.min(18, wanderer.agent.position.x));
      wanderer.agent.position.z = Math.max(-18, Math.min(18, wanderer.agent.position.z));
      wanderer.mesh.position.set(
        wanderer.agent.position.x,
        wanderer.agent.position.y,
        wanderer.agent.position.z
      );
    }
  }

  private updateHud() {
    if (!this.hud) return;
    const time = this.app.plugins.get(TimePlugin);
    const weather = this.app.plugins.get(WeatherPlugin);
    if (!time || !weather) return;
    this.hud.textContent = [
      "WASD move · Space jump",
      `day ${(time.day.progress * 100).toFixed(0)}%`,
      `rain ${weather.rain.value.toFixed(2)} · wind ${weather.wind.value.toFixed(2)} · snow ${weather.snow.value.toFixed(2)}`,
    ].join(" · ");
  }
}
