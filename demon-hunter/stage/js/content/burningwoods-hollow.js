TL.registerEncounter({
  id: "burningwoods-hollow",
  name: "Burningwoods Hollow",
  width: 64,
  height: 40,
  viewWidth: 66,
  viewHeight: 46,
  theme: "hollow",
  playerStart: {
    x: 12,
    y: 20
  },
  stations: [],
  tuning: {
    enemies: {
      dummy: {
        maxHealth: 5e3,
        armor: 852,
        boundingRadius: 1.6,
        combatReach: 1.5
      },
      satyr: {
        maxHealth: 405,
        maxMana: 360,
        armor: 460,
        speed: 6.5,
        aggroRadius: 60,
        boundingRadius: 1,
        combatReach: 1.5,
        preferredRange: 22,
        retreats: 0,
        retreatTrigger: 6,
        retreatDuration: 2.5,
        retreatCooldown: 7,
        shadowBolt: {
          castTime: 3,
          cost: 90,
          min: 74,
          max: 98,
          range: 30,
          repeatMin: 3.4,
          repeatMax: 5.8
        },
        melee: {
          min: 24,
          max: 31,
          speed: 2
        },
        respawn: Infinity
      },
      imp: {
        maxHealth: 250,
        armor: 450,
        speed: 7,
        aggroRadius: 60,
        boundingRadius: .7,
        combatReach: 1,
        min: 12,
        max: 16,
        attackSpeed: 2,
        respawn: Infinity
      },
      felguard: {
        maxHealth: 9e3,
        armor: 1700,
        speed: 6.5,
        aggroRadius: 60,
        boundingRadius: 2,
        combatReach: 2.2,
        min: 63,
        max: 81,
        attackSpeed: 2.2,
        respawn: Infinity,
        special: {
          name: "Felstorm",
          castTime: 2,
          radius: 8,
          min: 306,
          max: 360,
          first: 8,
          every: 15
        }
      },
      shadowmelder: {
        maxHealth: 1300,
        maxMana: 900,
        armor: 1e3,
        speed: 6.5,
        aggroRadius: 60,
        boundingRadius: 1,
        combatReach: 1.5,
        preferredRange: 22,
        retreats: 0,
        retreatTrigger: 6,
        retreatDuration: 2.5,
        retreatCooldown: 7,
        shadowBolt: {
          castTime: 3,
          cost: 180,
          min: 150,
          max: 185,
          range: 30,
          repeatMin: 4.5,
          repeatMax: 6.5
        },
        melee: {
          min: 62,
          max: 80,
          speed: 2
        },
        respawn: Infinity,
        channel: {
          name: "Shadow Veil",
          allyType: "felguard",
          cost: 120,
          duration: 10,
          gap: 2.5,
          range: 18,
          reduction: .75
        }
      }
    }
  },
  enemyTypes: {
    dummy: {
      name: "Training Dummy",
      color: "#8a6a45",
      ai: "dummy",
      immortal: true,
      portrait: "icons/training-dummy.webp"
    },
    satyr: {
      name: "Satyr Hellcaller",
      color: "#5f8f3a",
      ai: "caster",
      hasMana: true,
      isDemon: true,
      portrait: "icons/portrait-satyr.webp"
    },
    imp: {
      name: "Imp",
      color: "#d9772b",
      ai: "melee",
      isDemon: true,
      portrait: "icons/imps-blood.webp"
    },
    felguard: {
      name: "Felguard",
      color: "#3f7a2a",
      ai: "elite",
      isDemon: true,
      elite: true,
      boss: true,
      portrait: "icons/portrait-felguard.webp"
    },
    shadowmelder: {
      name: "Satyr Shadowmelder",
      color: "#5b3f8f",
      ai: "channeler",
      hasMana: true,
      isDemon: true,
      portrait: "icons/portrait-satyr.webp",
      ring: "#e3c9f0"
    }
  },
  waves: [ {
    name: "A Satyr Hellcaller",
    hint: "Close the distance and interrupt its Shadow Bolts.",
    spawns: [ {
      type: "satyr",
      x: 52,
      y: 20
    } ]
  }, {
    name: "A Swarm of Imps",
    hint: "Five imps at once. Burn them together.",
    spawns: [ {
      type: "imp",
      x: 50,
      y: 14
    }, {
      type: "imp",
      x: 54,
      y: 18
    }, {
      type: "imp",
      x: 54,
      y: 23
    }, {
      type: "imp",
      x: 50,
      y: 27
    }, {
      type: "imp",
      x: 47,
      y: 20
    } ]
  }, {
    name: "Twin Hellcallers",
    hint: "Two casters at once. Interrupt one while you cut down the other.",
    spawns: [ {
      type: "satyr",
      x: 54,
      y: 10
    }, {
      type: "satyr",
      x: 54,
      y: 30
    } ]
  }, {
    name: "The Felguard",
    hint: "Break the Shadow Veil. More Shadowmelders arrive every 30 sec. Leave the circle when Felstorm comes.",
    boss: "felguard",
    spawns: [ {
      type: "felguard",
      x: 46,
      y: 20
    }, {
      type: "shadowmelder",
      x: 58,
      y: 12
    } ],
    reinforce: {
      type: "shadowmelder",
      every: 30,
      at: [ {
        x: 60,
        y: 34
      }, {
        x: 60,
        y: 6
      }, {
        x: 34,
        y: 36
      }, {
        x: 34,
        y: 4
      } ]
    }
  } ],
  veiled(g, e) {
    if (e.type !== "felguard" || e.dead) return false;
    return g.enemies.some(m => !m.dead && m.type === "shadowmelder" && m.cast && m.cast.channel && !g.isDisabled(m));
  },
  damageTakenMult(g, e) {
    if (!this.veiled(g, e)) return 1;
    return 1 - g.tune.enemies.shadowmelder.channel.reduction;
  },
  update(g) {
    for (const e of g.enemies) e.veiled = this.veiled(g, e);
  }
});