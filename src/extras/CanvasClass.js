import * as THREE from "three";

export class CanvasClass {
  isSingleton = true;

  constructor(props) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = props.width;
    this.canvas.height = props.height;

    this.ctx = this.canvas.getContext("2d");

    this.texture = new THREE.CanvasTexture(this.canvas);

    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
  }
}
