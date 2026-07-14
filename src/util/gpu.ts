// https://medium.com/@saga_view/using-instancedskinnedmesh-in-three-js-7c364d602880

// export class GpuDetector {
//     gpu: string;
//     _level: 'high' | 'low' | 'middle' = 'high';

//     constructor() {
//       this.gpu = getGPUModel();
//       this.detectPC();
//       isMobileOrCloud ? this.detectMobile() : this.detectPC();
//       console.log('GPU: ', this.gpu, ';level:', this._level);
//     }
//     get level(): 'high' | 'low' | 'middle' {
//       return this._level;
//     }
//     detectMobile() {
//       if (iOS) {
//         this._level = window.screen.height >= 812 && window.devicePixelRatio >= 2 ? 'high' : 'low';
//       }
//       if (/adreno/i.test(this.gpu)) {
//         this._level = this.adrenoGPU();
//       } else if (/mali/i.test(this.gpu)) {
//         this._level = this.maliGPU();
//       } else if (/powervr/i.test(this.gpu)) {
//         this._level = this.powerVRGPU();
//       }
//     }
//     detectPC() {
//       if (!this.gpu) {
//         this._level = 'low'
//       }
//       /apple m/i.test(this.gpu)
//         ? (this._level = 'high')
//         : /apple/i.test(this.gpu)
//         ? (this._level = 'middle')
//         : /nvidia/i.test(this.gpu)
//         ? (this._level = this.nvidiaGPU())
//         : /amd/i.test(this.gpu)
//         ? (this._level = this.amdGPU())
//         : /intel/i.test(this.gpu) && (this._level = this.intelGPU());
//     }
//     powerVRGPU() {
//       return /GT8/i.test(this.gpu) ? 'high' : 'low';
//     }
//     adrenoGPU() {
//       var r = /^.+adreno\D+(\d+).+$/i.exec(this.gpu);
//       if (r !== null) {
//         var t = parseInt(r[1]);
//         return t > 640 ? 'high' : t >= 570 ? 'middle' : 'low';
//       }
//       var e = this.gpu.split(' '),
//         t = parseInt(e[e.length - 1]);
//       return t > 640 ? 'high' : t >= 570 ? 'middle' : 'low';
//     }
//     maliGPU() {
//       if (/mali-g/i.test(this.gpu)) {
//         var e = this.gpu.split('Mali-G'),
//           t = parseInt(e[e.length - 1]);
//         return t > 77 ? 'high' : 76 === t || 31 === t || 52 === t ? 'middle' : 'low';
//       }
//       return 'low';
//     }
//     nvidiaGPU() {
//       return /(rtx|titan)/i.test(this.gpu) ? 'high' : /gtx/i.test(this.gpu) ? 'middle' : 'low';
//     }
//     amdGPU() {
//       if (/(pro|radeon vii)/i.test(this.gpu)) return 'middle';
//       // if (/(pro|radeon vii)/i.test(this.gpu)) return 'high';
//       if (/(rx)/i.test(this.gpu)) {
//         var e = this.gpu.split('RX ');
//         return parseInt(e[e.length - 1]) > 560 ? 'middle' : 'low';
//         // return parseInt(e[e.length - 1]) > 560 ? 'high' : 'middle';
//       }
//       return 'middle';
//     }
//     // Intel gpu
//     intelGPU() {
//       if (/iris/i.test(this.gpu)) {
//         if (/opengl engine/i.test(this.gpu)) return 'middle';
//         var e = this.gpu.split('Graphics ');
//         return parseInt(e[1]) >= 650 ? 'middle' : 'low';
//       }
//       if (/HD/i.test(this.gpu)) {
//         var t = this.gpu.split('HD ');
//         return parseInt(t[1]) > 7e3 ? 'middle' : 'low';
//       }
//       return /apple/i.test(this.gpu) ? 'middle' : 'low';
//     }
//   }
