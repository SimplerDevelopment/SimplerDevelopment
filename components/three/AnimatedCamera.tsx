'use client';

import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

interface AnimatedCameraProps {
  position: [number, number, number];
  rotation: [number, number, number];
  lookAt?: [number, number, number];
}

export function AnimatedCamera({ position, rotation, lookAt }: AnimatedCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const { camera } = useThree();
  const lookAtTarget = useRef(new THREE.Vector3());
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!camera) return;

    // Set initial position only once
    if (!isInitialized.current) {
      camera.position.set(position[0], position[1], position[2]);
      if (lookAt) {
        lookAtTarget.current.set(...lookAt);
        camera.lookAt(lookAtTarget.current);
      } else {
        camera.rotation.set(...rotation);
      }
      isInitialized.current = true;
      return;
    }

    // Kill any existing animations on the camera to prevent conflicts
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera.quaternion);
    gsap.killTweensOf(lookAtTarget.current);

    // Animate camera position with GSAP from current position
    gsap.to(camera.position, {
      x: position[0],
      y: position[1],
      z: position[2],
      duration: 2.0,
      ease: 'power2.inOut',
    });

    // If lookAt is provided, smoothly transition to look at that point
    if (lookAt) {
      const target = new THREE.Vector3(...lookAt);

      // Animate the lookAt target
      gsap.to(lookAtTarget.current, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: 2.0,
        ease: 'power2.inOut',
        onUpdate: () => {
          camera.lookAt(lookAtTarget.current);
        },
      });
    } else {
      // Fallback to rotation-based camera orientation
      const targetEuler = new THREE.Euler(...rotation);
      const targetQuaternion = new THREE.Quaternion().setFromEuler(targetEuler);

      const tempQuat = {
        x: camera.quaternion.x,
        y: camera.quaternion.y,
        z: camera.quaternion.z,
        w: camera.quaternion.w,
      };

      gsap.to(tempQuat, {
        x: targetQuaternion.x,
        y: targetQuaternion.y,
        z: targetQuaternion.z,
        w: targetQuaternion.w,
        duration: 2.0,
        ease: 'power2.inOut',
        onUpdate: () => {
          camera.quaternion.set(tempQuat.x, tempQuat.y, tempQuat.z, tempQuat.w);
        },
      });
    }

    // Cleanup function to kill tweens on unmount
    return () => {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(camera.quaternion);
      gsap.killTweensOf(lookAtTarget.current);
    };
  }, [position, rotation, lookAt, camera]);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={75}
    />
  );
}
