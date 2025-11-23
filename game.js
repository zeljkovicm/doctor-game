const PLAYER_SIZE = 150;
const BLOCK_SIZE = 70;

/*
    Cista funkcija, prakticno konstruktorska funkcija koja kreira i vraca pocetno stanje igre, world objekat, ovo je i temelj ECS
    entities - lista svih entiteta u svetu (player, camera block, bag block, itd...)
    time - vreme proteklo od pocetka igre
    spawn - objekat koji kontrolise logiku spawnovanja blokova
    score - rezultat igre
    game - objekat koji ima jedno polje 'over', pokazujuci da li je igra zavrsena
    difficuly - objekat koji ima dva polja step (interval u sekundama posle kog igra postaje teza) i faktor mnozenja brzine blokova
*/
const createWorld = () => ({
    entities: [],
    time: 0,
    spawn: {
        last: 0,
        baseInterval: 0.8,
        interval: 0.8,
        minInterval: 0.25
    },
    score: 0,
    game: { over: false },
    difficulty: {
        step: 30,
        factor: 1.25
    }
});

/*
    Cista imutabilna funkcija koja dodaje novi entitet u listu entiteta koja se nalazi u world objektu
    Kreira novi world objekat, a ne menja postojeci
    Nacin na koji kreira novi objekat je tako sto se koristi spread operator da uzme:
        1. Sve postojece iz trenutnog world objekta (plitko kopiranje)
        2. Sve postojece iz entities liste, world objekta i doda novi entitet (isto plitko kopiranje)
    
    U odnosu na OOP, gde bismo imali jedan objekat world koji bi druge funkcije menjale, ovde se uvek kreira novi world objekat tako da 
    nijedna funkcija ne moze direktno da menja objekat. 

    Ovde je moguce koristiti takodje recimo i world.entites.push(entity) medjutim:
        1. To nije po principima funkcionalnog programiranja
        2. Teze je debagovanje
        3. Nije predvidivo stanje, jer samim tim nije imutabilno i bilo koja druga funkcija moze da izmeni objekat world
        4. Nema nuspojava
        5. Sto se tice memorije nije velika razlika izmedju OOP i FP, FP kreira vise objekata, medjutim JS garbage collector uklanja one koji
            se vise ne koriste automatski

*/
const addEntity = (world, entity) => ({
    ...world,
    entities: [...world.entities, entity]
});

/*
  Prva funkcija viseg reda (prima funkcije kao argumente (sisteme)) i vraca novu funkciju koja poziva sve te sisteme redom
  Sa reduce funkcijom poziva se svaka sistem funkcija koja za ulazne argumente uzima trentni svet i razliku u vremenu, a vraca novi
  svet koji je updateovan logikom iz svake ponaosob funkcije

  Ovde je jako bitan redosled dodavanja sistema u niz, jer ce se i tim redosledom izvrsavati, recimo ako se doda renderSystem
  na prvom mestu nista se nece prikazati na ekranu, jer se svi ostali sistemi za dodavanje igraca, movement itd dodaju nakon njega. 

  Sa ovom funkcijom prakticno imam jednu update funkciju koja redom poziva sve sisteme, i tako svaki dt (frejm) dobijam azuriran world
  Ovo je takodje primer kompozicije funkcija, sa rest parametrom i reduce metodom jer se pravi lanac transformacija

  Sistemi su nezavisni jedni od drugih, u sustini samo cekaju da dobiju novi world objekat koji je prethodni sistem generisao

  dt se koristi kako bi kretanje bilo glatko i nezavisno od FPS
*/
const pipeSystems = (...systems) => (world, dt) =>
    systems.reduce((w, sys) => sys(w, dt), world);


const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};

resizeCanvas();
window.addEventListener("resize", resizeCanvas); // event listener kada korisnik promeni velicinu prozora



/*
    IIFE - Immediatelly Invoked Function Expression
    Kreira objekat koji sadrzi sve slike koje igra koristi (player, bag, camera, background)

    Korisiti se IIFE da bi se slike (HTML) elementi odmah kreirali i odmah ucitali 

    U drugom slucaju moguce je postavljati sve na undefined i onda kasnije dodavati
*/
const images = {
    background: (() => {
        const img = new Image();
        img.src = "assets/hospital.jpg";
        return img;
    })(),
    player: (() => {
        const img = new Image();
        img.src = "assets/player.png";
        return img;
    })(),
    good: (() => {
        const img = new Image();
        img.src = "assets/bag.png";
        return img;
    })(),
    bad: (() => {
        const img = new Image();
        img.src = "assets/camera.png";
        return img;
    })()
};

let world = createWorld();


/*
    Player entitet
    x: canvas.width / 2 - PLAYER_SIZE / 2, - postavlja igraca u sredinu ekrana po sirini
    PLAYER_SIZE / 2 - koristi se da centrira player image, posto je canvas koristio gornji levi ugao kao referencu
*/
const player = {
    id: "player",
    components: {
        position: {
            x: canvas.width / 2 - PLAYER_SIZE / 2,
            y: canvas.height - PLAYER_SIZE - 20
        },
        size: { w: PLAYER_SIZE, h: PLAYER_SIZE }
    }
};

world = addEntity(world, player);

let inputState = { left: false, right: false };

/*
    inputSystem - reaguje samo na ArrowLeft i ArrowRight, za bilo koji drugi taster ne pravi novi objekat state
*/
const setInput = (state, key, isDown) => {
    if (key === "ArrowLeft") return { ...state, left: isDown };
    if (key === "ArrowRight") return { ...state, right: isDown };
    return state;
};

/*
    Browser poziva callback funkciju (e) nakon sto stvori event objekat svaki put kad se keydown ili key up desi
    Slusa globalno na window objektu, radi bez obzira gde se fokus nalazi
*/
window.addEventListener("keydown", (e) => {
    inputState = setInput(inputState, e.key, true);
});

window.addEventListener("keyup", (e) => {
    inputState = setInput(inputState, e.key, false);
});

const inputSystem = (world, dt) => ({ // vraca novi objekat world sa inputima
    ...world,
    input: inputState
});

/*
    Nakon sto inputSystem vrati world objekat koji u sebi ima input polje prolazi se kroz listu svih entiteta i trazi se 
    entitet sa id === "player" i izracunava novo x na osnovu inputa i vraca novi world objekat sa novim player entitetom
*/
const movementSystem = (world, dt) => {
    const speed = 350; // brzina pomeranja igraca u px/s

    const newEntities = world.entities.map((e) => {
        if (e.id !== "player") return e;

        const p = e.components.position; // trenutna pozicija nadjenog player entiteta iz trenutnog world objekta
        const input = world.input || {}; // input se postavlja da bude world.input iz world objekta ili prazan objekat ukoliko ne postoji

        const dx = (input.left ? -speed : 0) + (input.right ? speed : 0);

        let newX = p.x + dx * dt; // dx * dt omogucava da igrac ide istom brzinom bez obzira na FPS

        // Ne dozvoljava izlaz van granica ekrana
        newX = Math.max(0, Math.min(canvas.width - PLAYER_SIZE, newX));

        return { // vraca novi player entitet sa novom pozicijom
            ...e,
            components: {
                ...e.components,
                position: { x: newX, y: p.y }
            }
        };
    });

    return { ...world, entities: newEntities }; // vraca novi svet (plitko kopiran), i vraca novu listu entiteta sa azuriranim player
};


/*
    timeSystem - vraca novi world objekat sa azuriranim vremenom koliko je proteklo od pocetka partije
*/
const timeSystem = (world, dt) => ({
    ...world,
    time: world.time + dt
});


/*
    block entitet
    id - u mom slucaju moze biti good ili bad
    x - random x pozicija
    kind - good ili bad
*/
const createBlock = (id, x, kind) => ({
    id,
    components: {
        position: { x, y: -BLOCK_SIZE },
        size: { w: BLOCK_SIZE, h: BLOCK_SIZE },
        falling: { baseSpeed: 160, speed: 160 },
        tag: { kind }
    }
});


/*
    Kreira nove blokove na osnovu world.spawn podataka last i interval, tj kada je bio poslednji kreiran i koji je interval
    Postavlja blokove randomly na x osu
    Kreira blokove randomly (good, bad) - sanse su 
*/
const spawnerSystem = (world, dt) => {
    const { last, interval } = world.spawn;

    if (world.time - last < interval) return world; // ako nije proslo dovoljno vremena ne radi nista, ne kreira nove blokove

    const x = Math.random() * (canvas.width - BLOCK_SIZE);
    const kind = Math.random() < 0.7 ? "bad" : "good"; // random kreira blokove, medjutim sansa je uvek veca da ce ispasti bad block

    const blockId = `${kind}_${Math.floor(world.time * 1000)}`;
    const block = createBlock(blockId, x, kind);

    const newWorld = addEntity(world, block);

    return {
        ...newWorld,
        spawn: { ...world.spawn, last: world.time }
    };
};


/*
    fallingSystem - uzima trenutni world i frejm, pomera blokove po y-osi, ne utice na playera
    Sa mapom prolazi kroz listu entiteta i za one koji imaju falling i position povecava y-kordinatu
        Ovo je FP nacin, sa mapom, posto map ne mutira niz, vec kreira novi. Drugacije bi moglo sa forEach ali to nije FP nacin
    
*/
const fallingSystem = (world, dt) => {
    const newEntities = world.entities.map((e) => {
        const f = e.components.falling;
        const p = e.components.position;
        if (!f || !p) return e; // ukoliko entitet nema falling i position preskoci (preskace sve entitete koji nisu good i bad blokovi)

        return { // kopira ceo entitet, pravi novi sa starom kopijom komponenti, medjutim uzima nove vrednosti x i y
            ...e,
            components: {
                ...e.components,
                position: {
                    x: p.x,
                    y: p.y + f.speed * dt // koristim dt za smooth padanje nezavisno od FPS-a
                }
            }
        };
    });

    return { ...world, entities: newEntities };
};


/*
    difficultySystem - postepeno povecava tezinu igre tokom vremena
    povecava se broj spawnovanih blokova
    povecava se brzina spawnovanih blokova
*/
const difficultySystem = (world, dt) => {
    const { step, factor } = world.difficulty;

    const level = Math.floor(world.time / step); // Proteklo vreme podeljeno sa intervalom i zaokruzeno na celobrojnu vrednost (nizu)
    const speedMult = Math.pow(factor, level); // speedMultiplier - kvadrira faktor sa nivoom
    const intervalMult = Math.pow(1 / factor, level); // smanjuje spawn interval

    const newEntities = world.entities.map((e) => {
        const f = e.components.falling; // uzima sve entitete koji imaju falling u sebi
        if (!f) return e;

        return {
            ...e, // kopira sve entitete (plitko)
            components: {
                ...e.components, // kopira sve komponente (plitko)
                falling: {
                    ...f, // kopira sve falling objekte
                    speed: f.baseSpeed * speedMult // postavlja nove brzine falling objekata
                }
            }
        };
    });

    const rawInterval = world.spawn.baseInterval * intervalMult;
    const newInterval = Math.max(rawInterval, world.spawn.minInterval);

    return {
        ...world,
        entities: newEntities,
        spawn: { ...world.spawn, interval: newInterval }
    };
};


// helper f-ja koja racuna hitBox        
const hitboxWithMargins = (p, s, m) => ({
    x: p.x + s.w * m.left,
    y: p.y + s.h * m.top,
    w: s.w * (1 - m.left - m.right),
    h: s.h * (1 - m.top - m.bottom)
});

// margine bazirane ponaosob za svaku sliku
const PLAYER_MARGINS = { left: 0.15, right: 0.40, top: 0.08, bottom: 0.06 };
const GOOD_MARGINS = { left: 0.14, right: 0.14, top: 0.08, bottom: 0.18 };
const BAD_MARGINS = { left: 0.08, right: 0.08, top: 0.08, bottom: 0.07 };

// Helper f-ja, proverava da li se dva pravougaonika sudaraju AABB algoritam (Axis-Aligned Bounding Box)
// Primer, ako je A potpuno levo od B, ili potpuno desno ili iznad ili ispod oni se ne dodiruju
const rectsOverlap = (a, b) =>
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;

/*
    collisionSystem - proverava da li je igrac udario u good ili bad block
*/
const collisionSystem = (world, dt) => {
    if (world.game.over) return world; // ukoliko je igra vec zavrsena nema potrebe proveravati sudare

    const player = world.entities.find((e) => e.id === "player");
    if (!player) return world; // ako nema igraca vrati svet takav kakav jeste

    const pp = player.components.position;
    const ps = player.components.size;

    // koristi ranije definisane margine, jer player.png ima veliku transparentnu zonu oko sebe, i desava se da se sudar detektuje
    // iako bad block ili good block nisu vizuelno udarili u igraca
    const playerRect = hitboxWithMargins(pp, ps, PLAYER_MARGINS);

    let earned = 0;

    // Filter uklanja sakupljene good blokove
    const newEntities = world.entities.filter((e) => {
        const tag = e.components.tag;
        if (!tag) return true; // ignorise entitete bez tagova, ovde je samo player bez taga

        const p = e.components.position;
        const s = e.components.size;

        // Zavisno od taga uzima good ili bad margins
        const margins = tag.kind === "good" ? GOOD_MARGINS : BAD_MARGINS;
        const blockRect = hitboxWithMargins(p, s, margins);

        if (!rectsOverlap(playerRect, blockRect)) return true; // ako nema sudara, ostavi entitet u igri

        if (tag.kind === "good") {
            earned += 1;
            return false; // filter vraca false, uklanja entitet iz igre
        }

        return true; // ne uklanja ga nego ga ostavlja da se proveri da li je igrac udario i da li je game over
    });


    // Sa some() proveravam da li je igrac udario u bar jedan bad block. Some vraca true ukoliko pronadje bar jedan blok koji se sudari
    const hitBad = world.entities.some((e) => {
        const tag = e.components.tag;
        if (!tag || tag.kind !== "bad") return false;

        const p = e.components.position;
        const s = e.components.size;
        const blockRect = hitboxWithMargins(p, s, BAD_MARGINS);

        return rectsOverlap(playerRect, blockRect);
    });

    return { // vraca novi svet sa novim entitetima, novim skorom, i novim objektom game
        ...world,
        entities: newEntities,
        score: world.score + earned,
        game: { over: hitBad }
    };
};


// Proverava da li je entiet (blok) pao ispod ekrana i uklanja ga 
const cleanupSystem = (world, dt) => {
    const newEntities = world.entities.filter((e) => {
        const tag = e.components.tag;
        const p = e.components.position;
        const s = e.components.size;
        if (!tag) return true;

        return p.y < canvas.height + s.h; // ova linija ovde
    });

    return { ...world, entities: newEntities };
};



/*
    update poziva pipeSystem koji ima listu sistema (redosled u listi je bitan)
    sistemi uzimaju world i dt i prenose ga s jednog na drugi sistem
    svaki sistem vraca novi world
*/
const update = pipeSystems(
    timeSystem,
    inputSystem,
    movementSystem,
    spawnerSystem,
    fallingSystem,
    difficultySystem,
    collisionSystem,
    cleanupSystem
);



let lastTime = performance.now(); // visoko precizni timer koji vraca vreme u milisekundama od trenutka kada je stranica ucitana

const loop = (currentTime) => {
    const dt = (currentTime - lastTime) / 1000; // vreme proteklo izmedju dva frejma
    lastTime = currentTime; // azuriranje lastTime da bude trenutno vreme

    world = update(world, dt); // poziva se update world preko liste sistema

    ctx.clearRect(0, 0, canvas.width, canvas.height); // brisanje prethodnog frejma, cisti ceo ekran pre crtanja novog stanja

    if (images.background.complete) {
        ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
    }

    world.entities.forEach((e) => {
        const p = e.components.position;
        const s = e.components.size;
        const tag = e.components.tag;

        const sprite =
            e.id === "player" ? images.player :
                tag && tag.kind === "good" ? images.good :
                    tag && tag.kind === "bad" ? images.bad :
                        null;

        if (sprite && sprite.complete) {
            ctx.drawImage(sprite, p.x, p.y, s.w, s.h);
        }
    });

    ctx.fillStyle = "yellow";
    ctx.font = "40px Arial";
    ctx.fillText(`Score: ${world.score}`, 20, 40);

    if (world.game.over) {
        ctx.fillStyle = "yellow";
        ctx.font = "70px Arial";
        ctx.fillText("GAME OVER", canvas.width / 2 - 220, canvas.height / 2);
        return;
    }

    requestAnimationFrame(loop); // sve dok nije game over browser poziva sledeci render
};

requestAnimationFrame(loop);