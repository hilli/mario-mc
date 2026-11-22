/* Mario MC — motorcycle roster.
 * Stats are 1-10 and every bike has the same budget (29 points) so each
 * choice is a trade-off rather than a strict upgrade. `weight` (kg) only
 * matters when riders bump into each other.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MMC = Object.assign(root.MMC || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BIKES = [
    {
      id: 'r1300gsa', make: 'BMW', model: 'R 1300 GS Adventure',
      tagline: 'The 30-litre continent crusher. Unstoppable off-road.',
      engine: 'boxer', panniers: true, beak: true, tallScreen: true, frontWheel: 19, spokes: true,
      colors: { primary: '#2c3138', secondary: '#d4a017', accent: '#c9ced6', seat: '#1a1a1a', rider: '#3b4250', helmet: '#e8e8e8' },
      stats: { speed: 8, accel: 6, handling: 6, offroad: 9 }, weight: 269,
    },
    {
      id: 'r1300gs', make: 'BMW', model: 'R 1300 GS',
      tagline: 'The all-rounder benchmark in Trophy colours.',
      engine: 'boxer', panniers: false, beak: true, tallScreen: false, frontWheel: 19, spokes: true,
      colors: { primary: '#f4f6fa', secondary: '#1d5fd1', accent: '#d8262d', seat: '#1d5fd1', rider: '#1d5fd1', helmet: '#ffffff' },
      stats: { speed: 8, accel: 7, handling: 7, offroad: 7 }, weight: 237,
    },
    {
      id: 'f900gs', make: 'BMW', model: 'F 900 GS',
      tagline: 'Light, nimble and happiest when the tarmac ends.',
      engine: 'parallel', panniers: false, beak: true, tallScreen: false, frontWheel: 21, spokes: true,
      colors: { primary: '#f2c511', secondary: '#1b1b1b', accent: '#ffffff', seat: '#1b1b1b', rider: '#2b2b2b', helmet: '#f2c511' },
      stats: { speed: 6, accel: 8, handling: 7, offroad: 8 }, weight: 219,
    },
    {
      id: 'f900s', make: 'BMW', model: 'F 900 S',
      tagline: 'Road-focused and razor sharp through the twisties.',
      engine: 'parallel', panniers: false, beak: false, tallScreen: false, frontWheel: 17, spokes: false,
      colors: { primary: '#1a4fd6', secondary: '#c9ced6', accent: '#ffffff', seat: '#151515', rider: '#14275e', helmet: '#1a4fd6' },
      stats: { speed: 7, accel: 8, handling: 10, offroad: 4 }, weight: 211,
    },
    {
      id: 'ktm1390', make: 'KTM', model: '1390 Super Adventure',
      tagline: 'Ready to Race. The fastest thing on the grid.',
      engine: 'v', panniers: false, beak: false, tallScreen: true, frontWheel: 19, spokes: false,
      colors: { primary: '#ff6a00', secondary: '#1a1a1a', accent: '#ffffff', seat: '#1a1a1a', rider: '#ff6a00', helmet: '#1a1a1a' },
      stats: { speed: 10, accel: 8, handling: 5, offroad: 6 }, weight: 250,
    },
    {
      id: 'triumph900', make: 'Triumph', model: '900',
      tagline: 'Silky triple-cylinder torque with British poise.',
      engine: 'triple', panniers: false, beak: false, tallScreen: false, frontWheel: 21, spokes: true,
      colors: { primary: '#6b7a3f', secondary: '#1c1c1c', accent: '#e9e4d0', seat: '#1c1c1c', rider: '#4a5530', helmet: '#e9e4d0' },
      stats: { speed: 7, accel: 8, handling: 8, offroad: 6 }, weight: 222,
    },
    {
      id: 'desertx', make: 'Ducati', model: 'DesertX Gen 2',
      tagline: 'Rally DNA, 21-inch front. Sand is its playground.',
      engine: 'v', panniers: false, beak: false, tallScreen: true, frontWheel: 21, spokes: true,
      colors: { primary: '#f4f4f4', secondary: '#d71920', accent: '#1a1a1a', seat: '#d71920', rider: '#f4f4f4', helmet: '#d71920' },
      stats: { speed: 6, accel: 7, handling: 6, offroad: 10 }, weight: 223,
    },
    {
      id: 'multistradav4s', make: 'Ducati', model: 'Multistrada V4 S',
      tagline: 'Superbike heart in a touring suit. Blistering.',
      engine: 'v4', panniers: false, beak: false, tallScreen: true, frontWheel: 19, spokes: false,
      colors: { primary: '#c4161c', secondary: '#1a1a1a', accent: '#ffffff', seat: '#1a1a1a', rider: '#c4161c', helmet: '#ffffff' },
      stats: { speed: 10, accel: 9, handling: 6, offroad: 4 }, weight: 240,
    },
  ];

  BIKES.forEach((b) => { b.name = b.make + ' ' + b.model; });

  function getBike(id) {
    return BIKES.find((b) => b.id === id) || BIKES[0];
  }

  return { BIKES, getBike };
});
