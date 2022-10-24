import express from 'express'
import cors from 'cors'
const app = express();
const port = 3014;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Hello World!')
})

/* exclusive of max */
const randrange = (min, max) => min + Math.floor(Math.random() * (max - min));
const choose = arr => arr[Math.floor(Math.random() * arr.length)];

const XP_PER_SEC = 10;
const lvls = [
           120,   280,   480,
    720,  1400,  1700,  2100,
   2700,  3500,  6800,  7700,
   8800, 10100, 11600, 22000,
  24000, 26500, 29500, 33000,
  37000, 41500, 46500, 52000,
  99991,
];
const lvlFromXp = xp => {
  let i = 0;
  while (xp > 0 && i < lvls.length) xp -= lvls[i++];
  return { xp_to_go: Math.abs(xp), lvl: i };
};
const xpPerYield = xp => {
  const { lvl } = lvlFromXp(xp);
  return 300*(1 - (lvl / (lvls.length + 2)));
};


const takeItem = (stead, needs) => {
  for (const item in needs)
    if (!stead.inv[item] || stead.inv[item] < needs[item])
      return false;

  for (const item in needs)
    stead.inv[item] -= needs[item];
  return true;
};
const giveItem = (stead, items) => {
  for (const item in items) {
    stead.inv[item] ??= 0;
    stead.inv[item] += items[item];
  }
};

const plantStatuses = (stead, plant) => {
  const status_items = [ "cyl_item", "bbc_item", "hvv_item" ];
  return stead.ephemeral_statuses.concat(
    Object.entries(stead.inv)
      .filter(([kind, n]) => status_items.includes(kind))
      .flatMap(([kind, n]) => [...Array(n)].map(x => ({ kind, xp_multiplier: 1.5 })))
      .filter(status => {
        const c3 = str => str.substr(0, 3);
        return (["hvv", "bbc", "cyl"].includes(c3(status.kind)) &&
                c3(status.kind) == c3(plant.kind))               ;
      })
  );
}
const plantXpMultiplier = (stead, plant) => {
  let xp_multiplier = 1;
  for (const status of plantStatuses(stead, plant))
    xp_multiplier += status.xp_multiplier;
  return xp_multiplier;
};


const stead = {
  ephemeral_statuses: [],
  plants: [
    {
      kind: "dirt",
      xp: 0,
    },
    {
      kind: "bbc",
      xp: 0,
    }
  ],
  inv: {
    "cyl_item": 1,
    "nest_egg": 1,
    "bbc_seed": 1,
    "hvv_seed": 1,
    "cyl_seed": 1,
  }
};
const SECS_PER_TICK = 0.5;
setInterval(() => {
  stead.ephemeral_statuses = stead.ephemeral_statuses.filter(status => {
    status.tt_expire -= SECS_PER_TICK * 1000;

    return (status.tt_expire > 0);
  });

  for (const plant of stead.plants) {
    if (plant.kind == "dirt") continue;

    let xp_multiplier = plantXpMultiplier(stead, plant);

    /* I don't trust this logic to work with multiplier > 1 */
    for (let i = xp_multiplier; i > 0; i--) {
      const mult = Math.min(i, 1.0);

      const xp_per_tick = XP_PER_SEC * SECS_PER_TICK;
      const xppy = xpPerYield(plant.xp);

      plant.xp += xp_per_tick * mult;
      const xp_since_yield = plant.xp % xppy;
      if (xp_since_yield <= xp_per_tick)
        giveItem(stead, { [plant.kind + "_essence"]: 1 });
    }
  }
}, SECS_PER_TICK*1000);

const serializeStead = stead => {
  const sPlant = (plant) => {
    const { kind, xp } = plant;
    if (kind == "dirt") return { kind: "dirt" };
    const { lvl, xp_to_go } = lvlFromXp(xp);
    const xppy = xpPerYield(xp);
    const xpm = plantXpMultiplier(stead, plant);
    return {
      kind,
      lvl,
      tt_yield:   (xppy - (xp%xppy)) / XP_PER_SEC * 1000 / xpm,
      yield_prog: (xp%xppy) / xppy,
      tt_lvlup:   xp_to_go           / XP_PER_SEC * 1000 / xpm,
      lvlup_prog: xp_to_go / lvls[lvl]
    };
  };

  return {
    plants: stead.plants.map(sPlant),
    inv: stead.inv,
  };
};

app.get('/getstead', (req, res) => {
 return res.json(serializeStead(stead));
});

const manifest = {
  items: {
    "bbc_item":         { name: "Rolling Pin",
                          desc: "Makes all your bracti grow more! Probably ethical!" },
    "bbc_egg":          { name: "Bread Egg",
                          usable: true,
                          desc: "Contains hacker and coffee themed goodies, maybe dirt!" },
    "bbc_compressence": { name: "bressence",
                          desc: "EGGREDIENT. More bread than is safe to consume at once." },
    "bbc_essence":      { name: "Bread Essence",
                          desc: "COMPRESSABLE. Baked by a cactus. Tad undercooked." },
    "bbc_seed":         { name: "Bractus Seed",
                          desc: "Doughy, yet somehow still prickly." },
                       
    "hvv_item":         { name: "VINEB0RD",
                          desc: "Makes all your HVVs grow more! CLACK. CL4CK. CLACK." },
    "hvv_egg":          { name: "H4CKER 3GG",
                          usable: true,
                          desc: "Contains bread and coffee themed goodies, maybe dirt!" },
    "hvv_compressence": { name: "hacksprit",
                          desc: "EGGREDIENT. Hacker Spirit compressed with duct tape!" },
    "hvv_essence":      { name: "H4CK3R SP1RIT",
                          desc: "COMPRESSABLE. Makes you wanna make a thing! " },
    "hvv_seed":         { name: "HVV S33D",
                          desc: "Grows into 1337 h4x0r v1n3!" },
                       
    "cyl_item":         { name: "Cyl Wand",
                          desc: "Makes all your cyls grow more! Magic coffee stirrer!" },
    "cyl_egg":          { name: "Cyl Egg",
                          usable: true,
                          desc: "Contains bread and hacker themed goodies, maybe dirt!" },
    "cyl_compressence": { name: "crystcyl",
                          desc: "EGGREDIENT. Hums faintly. Can roast marshmallows!" },
    "cyl_essence":      { name: "Cyl Crystal",
                          desc: "COMPRESSABLE. Glows with aromatic orange energy!" },
    "cyl_seed":         { name: "Cyl Seed",
                          desc: "Do normal coffee beans glow orange in the dark?" },
                       
    "nest_egg":         { name: "Nest Egg",
                          usable: true,
                          desc: "OPEN ME. Some stuff to help you get started :)" },
                       
    "powder_t1":        { name: "Warp Powder",
                          usable: true,
                          desc: "Sparkles, glitters, glows, accelerates plant growth!" },
    "powder_t2":        { name: "Rift Powder",
                          usable: true,
                          desc: "x10 better Warp Powder! Rips open space time." },
    "powder_t3":        { name: "Wormhole Powder",
                          usable: true,
                          desc: "x100 better Warp Powder! May summon time worm." },
                         
    "land_deed":        { name: "Land Deed",
                          usable: true,
                          desc: "Lets you grow more things! Basically dirt paper!" },
 },
 plant_titles: {
   "dirt": "Dirt",
   "bbc":  "Bractus",
   "cyl":  "Coffea Cyl Plant",
   "hvv":  "H4CK3R V1B3Z V1N3",
 },
 plant_recipes: (() => {
   const trioPlant = (slug, frens) => {
     const compressence = {
       needs: { [slug + "_essence"]: 5 },
       make_item: slug + "_compressence"
     };
     const egg = { needs: {}, make_item: slug + "_egg" };
     egg.needs[frens[0] + "_compressence"] = 4;
     egg.needs[frens[1] + "_compressence"] = 4;

     return [compressence, egg];
   };
   return {
     "dirt": [
       { needs: { "bbc_seed": 1 }, change_plant_to: "bbc" },
       { needs: { "hvv_seed": 1 }, change_plant_to: "hvv" },
       { needs: { "cyl_seed": 1 }, change_plant_to: "cyl" },
     ],
     bbc: trioPlant("bbc", [       "cyl", "hvv"]),
     cyl: trioPlant("cyl", ["bbc",        "hvv"]),
     hvv: trioPlant("hvv", ["bbc", "cyl",      ]),
   };
 })(),
};

app.get('/manifest', (req, res) => {
  return res.json(manifest);
});

app.use(express.json());
app.post('/useitem', (req, res) => {
  const { item } = req.body;
  if (item == undefined)
    return res.json({ ok: false, msg: "learn how to use the api noob" });

  console.log("usable: " + manifest.items[item].usable);
  if (!manifest.items[item].usable)
    return res.json({ ok: false, msg: "that's not an item you can use!" });

  if (!takeItem(stead, { [item]: 1 }))
    return res.json({ ok: false, msg: "you can't afford that!" });

  console.log("pretend I'm using an " + item);
  if (item == "nest_egg") {
    giveItem(stead, {
      "powder_t1": choose([4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8]),
      "powder_t2": choose([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
      "bbc_seed": 1 + choose([0, 0, 0, 0, 0, 1]),
      "hvv_seed": 1 + choose([0, 0, 0, 0, 0, 1]),
      "cyl_seed": 1 + choose([0, 0, 0, 0, 0, 1]),
      "bbc_essence": 5 + choose([0, 0, 0, 1, 1, 2]),
      "hvv_essence": 5 + choose([0, 0, 0, 1, 1, 2]),
      "cyl_essence": 5 + choose([0, 0, 0, 1, 1, 2]),
    });
  }

  const powder_status = (kind, time_m, xp_m) => {
    const ms = 1000 * (50 + Math.random() * 30);
    return { kind, xp_multiplier: 2 * xp_m, tt_expire: Math.floor(ms * time_m) };
  }
  if (item == "powder_t1") stead.ephemeral_statuses.push(powder_status(item, 1   ,  1  ));
  if (item == "powder_t2") stead.ephemeral_statuses.push(powder_status(item, 1.2 ,  8.5));
  if (item == "powder_t3") stead.ephemeral_statuses.push(powder_status(item, 1.35, 75  ));

  if (item == "land_deed")
    stead.plants.push({
      kind: "dirt",
      xp: 0,
    });
});

app.post('/craft', (req, res) => {
  console.log("got request: " + JSON.stringify(req.body, undefined, 2));

  if (req.body.recipe_index == undefined || req.body.plot_index == undefined)
    return res.json({ ok: false, msg: "learn how to use the api noob" });

  const { recipe_index, plot_index } = req.body;
  const plant = stead.plants[plot_index];
  const recipe = manifest.plant_recipes[plant.kind][recipe_index];
  console.log(recipe);

  /* TODO: make sure you actually have the necessary items and fail gracefully */

  if (!takeItem(stead, recipe.needs))
    return res.json({ ok: false, msg: "you can't afford that!" });

  if (recipe.change_plant_to)
    plant.kind = recipe.change_plant_to;
  if (recipe.make_item)
    giveItem(stead, { [recipe.make_item]: 1 });

  return res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
