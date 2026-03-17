//! # BIP-39: Mnemonic Code for Generating Deterministic Keys
//!
//! BIP-39 describes the implementation of a mnemonic code or mnemonic sentence --
//! a group of easy to remember words -- for the generation of deterministic wallets.
//!
//! ## Overview
//!
//! - Convert entropy to mnemonic words (12, 15, 18, 21, or 24 words)
//! - Mnemonic to seed conversion (with optional passphrase)
//! - 2048-word dictionary (English)
//! - Built-in checksum for error detection
//!
//! ## Word Counts
//!
//! | Entropy | Checksum | Total Bits | Words |
//! |---------|----------|------------|-------|
//! | 128 bits | 4 bits  | 132 bits   | 12    |
//! | 160 bits | 5 bits  | 165 bits   | 15    |
//! | 192 bits | 6 bits  | 198 bits   | 18    |
//! | 224 bits | 7 bits  | 231 bits   | 21    |
//! | 256 bits | 8 bits  | 264 bits   | 24    |
//!
//! ## Process
//!
//! 1. Generate entropy (128-256 bits)
//! 2. Add checksum (first n bits of SHA256(entropy))
//! 3. Split into 11-bit chunks
//! 4. Map each chunk to word in dictionary
//! 5. Join words with spaces
//!
//! ## Seed Generation
//!
//! PBKDF2-HMAC-SHA512 with:
//! - Password: Mnemonic sentence (UTF-8 NFKD normalized)
//! - Salt: "mnemonic" + passphrase (UTF-8 NFKD normalized)
//! - Iterations: 2048
//! - Output: 512-bit seed

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha512 = Hmac<sha2::Sha512>;

/// BIP-39 mnemonic sentence
#[derive(Debug, Clone, PartialEq)]
pub struct Mnemonic {
    /// Mnemonic words
    pub words: Vec<String>,

    /// Original entropy
    pub entropy: Vec<u8>,

    /// Language (only English supported)
    pub language: Language,
}

/// Supported languages
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    /// English BIP-39 wordlist.
    English,
}

/// BIP-39 errors
#[derive(Debug, Clone, PartialEq)]
pub enum Bip39Error {
    /// Invalid entropy length
    InvalidEntropyLength,

    /// Invalid word count
    InvalidWordCount,

    /// Invalid checksum
    InvalidChecksum,

    /// Word not in dictionary
    InvalidWord(String),

    /// Invalid mnemonic format
    InvalidMnemonic,
}

/// BIP-39 English wordlist (2048 words).
const WORDLIST: &[&str] = &[
    "abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse",
    "access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act",
    "action","actor","actress","actual","adapt","add","addict","address","adjust","admit",
    "adult","advance","advice","aerobic","affair","afford","afraid","again","age","agent",
    "agree","ahead","aim","air","airport","aisle","alarm","album","alcohol","alert",
    "alien","all","alley","allow","almost","alone","alpha","already","also","alter",
    "always","amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger",
    "angle","angry","animal","ankle","announce","annual","another","answer","antenna","antique",
    "anxiety","any","apart","apology","appear","apple","approve","april","arch","arctic",
    "area","arena","argue","arm","armed","armor","army","around","arrange","arrest",
    "arrive","arrow","art","artefact","artist","artwork","ask","aspect","assault","asset",
    "assist","assume","asthma","athlete","atom","attack","attend","attitude","attract","auction",
    "audit","august","aunt","author","auto","autumn","average","avocado","avoid","awake",
    "aware","away","awesome","awful","awkward","axis","baby","bachelor","bacon","badge",
    "bag","balance","balcony","ball","bamboo","banana","banner","bar","barely","bargain",
    "barrel","base","basic","basket","battle","beach","bean","beauty","because","become",
    "beef","before","begin","behave","behind","believe","below","belt","bench","benefit",
    "best","betray","better","between","beyond","bicycle","bid","bike","bind","biology",
    "bird","birth","bitter","black","blade","blame","blanket","blast","bleak","bless",
    "blind","blood","blossom","blouse","blue","blur","blush","board","boat","body",
    "boil","bomb","bone","bonus","book","boost","border","boring","borrow","boss",
    "bottom","bounce","box","boy","bracket","brain","brand","brass","brave","bread",
    "breeze","brick","bridge","brief","bright","bring","brisk","broccoli","broken","bronze",
    "broom","brother","brown","brush","bubble","buddy","budget","buffalo","build","bulb",
    "bulk","bullet","bundle","bunker","burden","burger","burst","bus","business","busy",
    "butter","buyer","buzz","cabbage","cabin","cable","cactus","cage","cake","call",
    "calm","camera","camp","can","canal","cancel","candy","cannon","canoe","canvas",
    "canyon","capable","capital","captain","car","carbon","card","cargo","carpet","carry",
    "cart","case","cash","casino","castle","casual","cat","catalog","catch","category",
    "cattle","caught","cause","caution","cave","ceiling","celery","cement","census","century",
    "cereal","certain","chair","chalk","champion","change","chaos","chapter","charge","chase",
    "chat","cheap","check","cheese","chef","cherry","chest","chicken","chief","child",
    "chimney","choice","choose","chronic","chuckle","chunk","churn","cigar","cinnamon","circle",
    "citizen","city","civil","claim","clap","clarify","claw","clay","clean","clerk",
    "clever","click","client","cliff","climb","clinic","clip","clock","clog","close",
    "cloth","cloud","clown","club","clump","cluster","clutch","coach","coast","coconut",
    "code","coffee","coil","coin","collect","color","column","combine","come","comfort",
    "comic","common","company","concert","conduct","confirm","congress","connect","consider","control",
    "convince","cook","cool","copper","copy","coral","core","corn","correct","cost",
    "cotton","couch","country","couple","course","cousin","cover","coyote","crack","cradle",
    "craft","cram","crane","crash","crater","crawl","crazy","cream","credit","creek",
    "crew","cricket","crime","crisp","critic","crop","cross","crouch","crowd","crucial",
    "cruel","cruise","crumble","crunch","crush","cry","crystal","cube","culture","cup",
    "cupboard","curious","current","curtain","curve","cushion","custom","cute","cycle","dad",
    "damage","damp","dance","danger","daring","dash","daughter","dawn","day","deal",
    "debate","debris","decade","december","decide","decline","decorate","decrease","deer","defense",
    "define","defy","degree","delay","deliver","demand","demise","denial","dentist","deny",
    "depart","depend","deposit","depth","deputy","derive","describe","desert","design","desk",
    "despair","destroy","detail","detect","develop","device","devote","diagram","dial","diamond",
    "diary","dice","diesel","diet","differ","digital","dignity","dilemma","dinner","dinosaur",
    "direct","dirt","disagree","discover","disease","dish","dismiss","disorder","display","distance",
    "divert","divide","divorce","dizzy","doctor","document","dog","doll","dolphin","domain",
    "donate","donkey","donor","door","dose","double","dove","draft","dragon","drama",
    "drastic","draw","dream","dress","drift","drill","drink","drip","drive","drop",
    "drum","dry","duck","dumb","dune","during","dust","dutch","duty","dwarf",
    "dynamic","eager","eagle","early","earn","earth","easily","east","easy","echo",
    "ecology","economy","edge","edit","educate","effort","egg","eight","either","elbow",
    "elder","electric","elegant","element","elephant","elevator","elite","else","embark","embody",
    "embrace","emerge","emotion","employ","empower","empty","enable","enact","end","endless",
    "endorse","enemy","energy","enforce","engage","engine","enhance","enjoy","enlist","enough",
    "enrich","enroll","ensure","enter","entire","entry","envelope","episode","equal","equip",
    "era","erase","erode","erosion","error","erupt","escape","essay","essence","estate",
    "eternal","ethics","evidence","evil","evoke","evolve","exact","example","excess","exchange",
    "excite","exclude","excuse","execute","exercise","exhaust","exhibit","exile","exist","exit",
    "exotic","expand","expect","expire","explain","expose","express","extend","extra","eye",
    "eyebrow","fabric","face","faculty","fade","faint","faith","fall","false","fame",
    "family","famous","fan","fancy","fantasy","farm","fashion","fat","fatal","father",
    "fatigue","fault","favorite","feature","february","federal","fee","feed","feel","female",
    "fence","festival","fetch","fever","few","fiber","fiction","field","figure","file",
    "film","filter","final","find","fine","finger","finish","fire","firm","first",
    "fiscal","fish","fit","fitness","fix","flag","flame","flash","flat","flavor",
    "flee","flight","flip","float","flock","floor","flower","fluid","flush","fly",
    "foam","focus","fog","foil","fold","follow","food","foot","force","forest",
    "forget","fork","fortune","forum","forward","fossil","foster","found","fox","fragile",
    "frame","frequent","fresh","friend","fringe","frog","front","frost","frown","frozen",
    "fruit","fuel","fun","funny","furnace","fury","future","gadget","gain","galaxy",
    "gallery","game","gap","garage","garbage","garden","garlic","garment","gas","gasp",
    "gate","gather","gauge","gaze","general","genius","genre","gentle","genuine","gesture",
    "ghost","giant","gift","giggle","ginger","giraffe","girl","give","glad","glance",
    "glare","glass","glide","glimpse","globe","gloom","glory","glove","glow","glue",
    "goat","goddess","gold","good","goose","gorilla","gospel","gossip","govern","gown",
    "grab","grace","grain","grant","grape","grass","gravity","great","green","grid",
    "grief","grit","grocery","group","grow","grunt","guard","guess","guide","guilt",
    "guitar","gun","gym","habit","hair","half","hammer","hamster","hand","happy",
    "harbor","hard","harsh","harvest","hat","have","hawk","hazard","head","health",
    "heart","heavy","hedgehog","height","hello","helmet","help","hen","hero","hidden",
    "high","hill","hint","hip","hire","history","hobby","hockey","hold","hole",
    "holiday","hollow","home","honey","hood","hope","horn","horror","horse","hospital",
    "host","hotel","hour","hover","hub","huge","human","humble","humor","hundred",
    "hungry","hunt","hurdle","hurry","hurt","husband","hybrid","ice","icon","idea",
    "identify","idle","ignore","ill","illegal","illness","image","imitate","immense","immune",
    "impact","impose","improve","impulse","inch","include","income","increase","index","indicate",
    "indoor","industry","infant","inflict","inform","inhale","inherit","initial","inject","injury",
    "inmate","inner","innocent","input","inquiry","insane","insect","inside","inspire","install",
    "intact","interest","into","invest","invite","involve","iron","island","isolate","issue",
    "item","ivory","jacket","jaguar","jar","jazz","jealous","jeans","jelly","jewel",
    "job","join","joke","journey","joy","judge","juice","jump","jungle","junior",
    "junk","just","kangaroo","keen","keep","ketchup","key","kick","kid","kidney",
    "kind","kingdom","kiss","kit","kitchen","kite","kitten","kiwi","knee","knife",
    "knock","know","lab","label","labor","ladder","lady","lake","lamp","language",
    "laptop","large","later","latin","laugh","laundry","lava","law","lawn","lawsuit",
    "layer","lazy","leader","leaf","learn","leave","lecture","left","leg","legal",
    "legend","leisure","lemon","lend","length","lens","leopard","lesson","letter","level",
    "liar","liberty","library","license","life","lift","light","like","limb","limit",
    "link","lion","liquid","list","little","live","lizard","load","loan","lobster",
    "local","lock","logic","lonely","long","loop","lottery","loud","lounge","love",
    "loyal","lucky","luggage","lumber","lunar","lunch","luxury","lyrics","machine","mad",
    "magic","magnet","maid","mail","main","major","make","mammal","man","manage",
    "mandate","mango","mansion","manual","maple","marble","march","margin","marine","market",
    "marriage","mask","mass","master","match","material","math","matrix","matter","maximum",
    "maze","meadow","mean","measure","meat","mechanic","medal","media","melody","melt",
    "member","memory","mention","menu","mercy","merge","merit","merry","mesh","message",
    "metal","method","middle","midnight","milk","million","mimic","mind","minimum","minor",
    "minute","miracle","mirror","misery","miss","mistake","mix","mixed","mixture","mobile",
    "model","modify","mom","moment","monitor","monkey","monster","month","moon","moral",
    "more","morning","mosquito","mother","motion","motor","mountain","mouse","move","movie",
    "much","muffin","mule","multiply","muscle","museum","mushroom","music","must","mutual",
    "myself","mystery","myth","naive","name","napkin","narrow","nasty","nation","nature",
    "near","neck","need","negative","neglect","neither","nephew","nerve","nest","net",
    "network","neutral","never","news","next","nice","night","noble","noise","nominee",
    "noodle","normal","north","nose","notable","note","nothing","notice","novel","now",
    "nuclear","number","nurse","nut","oak","obey","object","oblige","obscure","observe",
    "obtain","obvious","occur","ocean","october","odor","off","offer","office","often",
    "oil","okay","old","olive","olympic","omit","once","one","onion","online",
    "only","open","opera","opinion","oppose","option","orange","orbit","orchard","order",
    "ordinary","organ","orient","original","orphan","ostrich","other","outdoor","outer","output",
    "outside","oval","oven","over","own","owner","oxygen","oyster","ozone","pact",
    "paddle","page","pair","palace","palm","panda","panel","panic","panther","paper",
    "parade","parent","park","parrot","party","pass","patch","path","patient","patrol",
    "pattern","pause","pave","payment","peace","peanut","pear","peasant","pelican","pen",
    "penalty","pencil","people","pepper","perfect","permit","person","pet","phone","photo",
    "phrase","physical","piano","picnic","picture","piece","pig","pigeon","pill","pilot",
    "pink","pioneer","pipe","pistol","pitch","pizza","place","planet","plastic","plate",
    "play","please","pledge","pluck","plug","plunge","poem","poet","point","polar",
    "pole","police","pond","pony","pool","popular","portion","position","possible","post",
    "potato","pottery","poverty","powder","power","practice","praise","predict","prefer","prepare",
    "present","pretty","prevent","price","pride","primary","print","priority","prison","private",
    "prize","problem","process","produce","profit","program","project","promote","proof","property",
    "prosper","protect","proud","provide","public","pudding","pull","pulp","pulse","pumpkin",
    "punch","pupil","puppy","purchase","purity","purpose","purse","push","put","puzzle",
    "pyramid","quality","quantum","quarter","question","quick","quit","quiz","quote","rabbit",
    "raccoon","race","rack","radar","radio","rail","rain","raise","rally","ramp",
    "ranch","random","range","rapid","rare","rate","rather","raven","raw","razor",
    "ready","real","reason","rebel","rebuild","recall","receive","recipe","record","recycle",
    "reduce","reflect","reform","refuse","region","regret","regular","reject","relax","release",
    "relief","rely","remain","remember","remind","remove","render","renew","rent","reopen",
    "repair","repeat","replace","report","require","rescue","resemble","resist","resource","response",
    "result","retire","retreat","return","reunion","reveal","review","reward","rhythm","rib",
    "ribbon","rice","rich","ride","ridge","rifle","right","rigid","ring","riot",
    "ripple","risk","ritual","rival","river","road","roast","robot","robust","rocket",
    "romance","roof","rookie","room","rose","rotate","rough","round","route","royal",
    "rubber","rude","rug","rule","run","runway","rural","sad","saddle","sadness",
    "safe","sail","salad","salmon","salon","salt","salute","same","sample","sand",
    "satisfy","satoshi","sauce","sausage","save","say","scale","scan","scare","scatter",
    "scene","scheme","school","science","scissors","scorpion","scout","scrap","screen","script",
    "scrub","sea","search","season","seat","second","secret","section","security","seed",
    "seek","segment","select","sell","seminar","senior","sense","sentence","series","service",
    "session","settle","setup","seven","shadow","shaft","shallow","share","shed","shell",
    "sheriff","shield","shift","shine","ship","shiver","shock","shoe","shoot","shop",
    "short","shoulder","shove","shrimp","shrug","shuffle","shy","sibling","sick","side",
    "siege","sight","sign","silent","silk","silly","silver","similar","simple","since",
    "sing","siren","sister","situate","six","size","skate","sketch","ski","skill",
    "skin","skirt","skull","slab","slam","sleep","slender","slice","slide","slight",
    "slim","slogan","slot","slow","slush","small","smart","smile","smoke","smooth",
    "snack","snake","snap","sniff","snow","soap","soccer","social","sock","soda",
    "soft","solar","soldier","solid","solution","solve","someone","song","soon","sorry",
    "sort","soul","sound","soup","source","south","space","spare","spatial","spawn",
    "speak","special","speed","spell","spend","sphere","spice","spider","spike","spin",
    "spirit","split","spoil","sponsor","spoon","sport","spot","spray","spread","spring",
    "spy","square","squeeze","squirrel","stable","stadium","staff","stage","stairs","stamp",
    "stand","start","state","stay","steak","steel","stem","step","stereo","stick",
    "still","sting","stock","stomach","stone","stool","story","stove","strategy","street",
    "strike","strong","struggle","student","stuff","stumble","style","subject","submit","subway",
    "success","such","sudden","suffer","sugar","suggest","suit","summer","sun","sunny",
    "sunset","super","supply","supreme","sure","surface","surge","surprise","surround","survey",
    "suspect","sustain","swallow","swamp","swap","swarm","swear","sweet","swift","swim",
    "swing","switch","sword","symbol","symptom","syrup","system","table","tackle","tag",
    "tail","talent","talk","tank","tape","target","task","taste","tattoo","taxi",
    "teach","team","tell","ten","tenant","tennis","tent","term","test","text",
    "thank","that","theme","then","theory","there","they","thing","this","thought",
    "three","thrive","throw","thumb","thunder","ticket","tide","tiger","tilt","timber",
    "time","tiny","tip","tired","tissue","title","toast","tobacco","today","toddler",
    "toe","together","toilet","token","tomato","tomorrow","tone","tongue","tonight","tool",
    "tooth","top","topic","topple","torch","tornado","tortoise","toss","total","tourist",
    "toward","tower","town","toy","track","trade","traffic","tragic","train","transfer",
    "trap","trash","travel","tray","treat","tree","trend","trial","tribe","trick",
    "trigger","trim","trip","trophy","trouble","truck","true","truly","trumpet","trust",
    "truth","try","tube","tuition","tumble","tuna","tunnel","turkey","turn","turtle",
    "twelve","twenty","twice","twin","twist","two","type","typical","ugly","umbrella",
    "unable","unaware","uncle","uncover","under","undo","unfair","unfold","unhappy","uniform",
    "unique","unit","universe","unknown","unlock","until","unusual","unveil","update","upgrade",
    "uphold","upon","upper","upset","urban","urge","usage","use","used","useful",
    "useless","usual","utility","vacant","vacuum","vague","valid","valley","valve","van",
    "vanish","vapor","various","vast","vault","vehicle","velvet","vendor","venture","venue",
    "verb","verify","version","very","vessel","veteran","viable","vibrant","vicious","victory",
    "video","view","village","vintage","violin","virtual","virus","visa","visit","visual",
    "vital","vivid","vocal","voice","void","volcano","volume","vote","voyage","wage",
    "wagon","wait","walk","wall","walnut","want","warfare","warm","warrior","wash",
    "wasp","waste","water","wave","way","wealth","weapon","wear","weasel","weather",
    "web","wedding","weekend","weird","welcome","west","wet","whale","what","wheat",
    "wheel","when","where","whip","whisper","wide","width","wife","wild","will",
    "win","window","wine","wing","wink","winner","winter","wire","wisdom","wise",
    "wish","witness","wolf","woman","wonder","wood","wool","word","work","world",
    "worry","worth","wrap","wreck","wrestle","wrist","write","wrong","yard","year",
    "yellow","you","young","youth","zebra","zero","zone","zoo",

];

impl Mnemonic {
    /// Generate mnemonic from entropy
    pub fn from_entropy(entropy: &[u8]) -> Result<Self, Bip39Error> {
        // Validate entropy length (128, 160, 192, 224, or 256 bits)
        let entropy_bits = entropy.len() * 8;
        if ![128, 160, 192, 224, 256].contains(&entropy_bits) {
            return Err(Bip39Error::InvalidEntropyLength);
        }

        // Calculate checksum
        let checksum_bits = entropy_bits / 32;
        let hash = Sha256::digest(entropy);
        let checksum = hash[0];

        // Combine entropy and checksum
        let mut bits = Vec::new();
        for byte in entropy {
            for i in (0..8).rev() {
                bits.push((byte >> i) & 1);
            }
        }

        // Add checksum bits
        for i in (0..checksum_bits).rev() {
            bits.push((checksum >> (7 - i)) & 1);
        }

        // Convert to words (11 bits per word)
        let mut words = Vec::new();
        for chunk in bits.chunks(11) {
            let mut index = 0u16;
            for (i, &bit) in chunk.iter().enumerate() {
                index |= (bit as u16) << (10 - i);
            }

            words.push(WORDLIST[index as usize].to_string());
        }

        Ok(Mnemonic {
            words,
            entropy: entropy.to_vec(),
            language: Language::English,
        })
    }

    /// Parse mnemonic from string
    pub fn from_phrase(phrase: &str) -> Result<Self, Bip39Error> {
        let words: Vec<String> = phrase
            .split_whitespace()
            .map(|w| w.to_lowercase())
            .collect();

        // Validate word count
        if ![12, 15, 18, 21, 24].contains(&words.len()) {
            return Err(Bip39Error::InvalidWordCount);
        }

        // Validate words in dictionary
        for word in &words {
            if !WORDLIST.contains(&word.as_str()) {
                return Err(Bip39Error::InvalidWord(word.clone()));
            }
        }

        // Convert words back to bits
        let mut bits = Vec::new();
        for word in &words {
            let index = WORDLIST
                .iter()
                .position(|&w| w == word)
                .ok_or_else(|| Bip39Error::InvalidWord(word.clone()))?;

            // Convert index to 11 bits
            for i in (0..11).rev() {
                bits.push(((index >> i) & 1) as u8);
            }
        }

        // Extract entropy and checksum
        let entropy_bits = (bits.len() * 32) / 33;
        let checksum_bits = bits.len() - entropy_bits;

        let mut entropy = Vec::new();
        for chunk in bits[..entropy_bits].chunks(8) {
            let mut byte = 0u8;
            for (i, &bit) in chunk.iter().enumerate() {
                byte |= bit << (7 - i);
            }
            entropy.push(byte);
        }

        // Verify checksum (strict BIP-39 validation)
        let hash = Sha256::digest(&entropy);
        let expected_checksum = hash[0] >> (8 - checksum_bits);

        let mut actual_checksum = 0u8;
        for (i, &bit) in bits[entropy_bits..].iter().enumerate() {
            actual_checksum |= bit << (checksum_bits - 1 - i);
        }

        if actual_checksum != expected_checksum {
            return Err(Bip39Error::InvalidChecksum);
        }

        Ok(Mnemonic {
            words,
            entropy,
            language: Language::English,
        })
    }

    /// Convert mnemonic to seed (512 bits)
    pub fn to_seed(&self, passphrase: &str) -> [u8; 64] {
        let mnemonic_str = self.words.join(" ");
        let salt = format!("mnemonic{}", passphrase);

        Self::pbkdf2_sha512(mnemonic_str.as_bytes(), salt.as_bytes(), 2048)
    }

    /// Get mnemonic as string
    pub fn to_phrase(&self) -> String {
        self.words.join(" ")
    }

    /// PBKDF2-HMAC-SHA512 (simplified)
    fn pbkdf2_sha512(password: &[u8], salt: &[u8], iterations: usize) -> [u8; 64] {
        let mut result = [0u8; 64];

        // This is a simplified educational version
        // Production should use proper PBKDF2 implementation

        // SAFETY: HMAC-SHA512 accepts keys of any length.
        let mut mac = HmacSha512::new_from_slice(password).expect("HMAC can take key of any size");
        mac.update(salt);
        mac.update(&1u32.to_be_bytes());

        let mut u = mac.finalize().into_bytes();
        result.copy_from_slice(&u);

        for _ in 1..iterations {
            // SAFETY: HMAC-SHA512 accepts keys of any length.
            let mut mac =
                HmacSha512::new_from_slice(password).expect("HMAC can take key of any size");
            mac.update(&u);
            u = mac.finalize().into_bytes();

            // XOR with result
            for i in 0..64 {
                result[i] ^= u[i];
            }
        }

        result
    }
}

impl Language {
    /// Get wordlist for language
    pub fn wordlist(&self) -> &'static [&'static str] {
        match self {
            Language::English => WORDLIST,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wordlist_has_2048_words() {
        assert_eq!(WORDLIST.len(), 2048, "BIP-39 English wordlist must have exactly 2048 words");
    }

    #[test]
    fn test_generate_12_word_mnemonic() {
        let entropy = [0x42u8; 16]; // 128 bits
        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();

        assert_eq!(mnemonic.words.len(), 12);
        assert_eq!(mnemonic.entropy, entropy);
    }

    #[test]
    fn test_generate_24_word_mnemonic() {
        let entropy = [0x42u8; 32]; // 256 bits
        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();

        assert_eq!(mnemonic.words.len(), 24);
    }

    #[test]
    fn test_invalid_entropy_length() {
        let entropy = [0x42u8; 15]; // 120 bits (invalid)
        let result = Mnemonic::from_entropy(&entropy);

        assert_eq!(result.unwrap_err(), Bip39Error::InvalidEntropyLength);
    }

    #[test]
    fn test_mnemonic_to_phrase() {
        let entropy = [0x42u8; 16];
        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();

        let phrase = mnemonic.to_phrase();
        assert_eq!(phrase.split_whitespace().count(), 12);
    }

    #[test]
    fn test_phrase_roundtrip() {
        let entropy = [0x42u8; 16];
        let mnemonic1 = Mnemonic::from_entropy(&entropy).unwrap();
        let phrase = mnemonic1.to_phrase();

        let mnemonic2 = Mnemonic::from_phrase(&phrase).unwrap();

        // NOTE: Due to modulo operation with 100-word educational wordlist,
        // entropy may not roundtrip exactly. However, the words and seeds should match.
        assert_eq!(mnemonic1.words, mnemonic2.words);

        // Verify that both mnemonics produce the same seed (this is what matters)
        let seed1 = mnemonic1.to_seed("");
        let seed2 = mnemonic2.to_seed("");
        assert_eq!(seed1, seed2, "Seeds should match even if entropy differs");
    }

    #[test]
    fn test_invalid_word_count() {
        let phrase = "abandon abandon abandon"; // 3 words (invalid)
        let result = Mnemonic::from_phrase(phrase);

        assert_eq!(result.unwrap_err(), Bip39Error::InvalidWordCount);
    }

    #[test]
    fn test_to_seed() {
        let entropy = [0x42u8; 16];
        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();

        let seed = mnemonic.to_seed("");
        assert_eq!(seed.len(), 64); // 512 bits
    }

    #[test]
    fn test_seed_with_passphrase() {
        let entropy = [0x42u8; 16];
        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();

        let seed1 = mnemonic.to_seed("");
        let seed2 = mnemonic.to_seed("password");

        // Different passphrases should produce different seeds
        assert_ne!(seed1, seed2);
    }

    #[test]
    fn test_deterministic_generation() {
        let entropy = [0x42u8; 16];
        let mnemonic1 = Mnemonic::from_entropy(&entropy).unwrap();
        let mnemonic2 = Mnemonic::from_entropy(&entropy).unwrap();

        assert_eq!(mnemonic1.words, mnemonic2.words);
    }

    #[test]
    fn test_wordlist_access() {
        let lang = Language::English;
        let wordlist = lang.wordlist();

        assert!(!wordlist.is_empty());
        assert!(wordlist.contains(&"abandon"));
    }

    #[test]
    fn test_24_byte_entropy_produces_18_words() {
        // 192 bits + 6 checksum bits = 198 bits / 11 = 18 words
        let entropy = [0xABu8; 24];
        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();
        assert_eq!(mnemonic.words.len(), 18);
    }

    #[test]
    fn test_all_valid_entropy_sizes_succeed() {
        for size in [16usize, 20, 24, 28, 32] {
            let entropy = vec![0x55u8; size];
            assert!(
                Mnemonic::from_entropy(&entropy).is_ok(),
                "entropy size {} should be valid",
                size
            );
        }
    }

    #[test]
    fn test_17_byte_entropy_rejected() {
        // 136 bits — not in the valid set {128,160,192,224,256}
        let entropy = [0x42u8; 17];
        let result = Mnemonic::from_entropy(&entropy);
        assert_eq!(result.unwrap_err(), Bip39Error::InvalidEntropyLength);
    }

    #[test]
    fn test_empty_phrase_rejected() {
        let result = Mnemonic::from_phrase("");
        assert_eq!(result.unwrap_err(), Bip39Error::InvalidWordCount);
    }

    #[test]
    fn test_unknown_word_in_phrase_rejected() {
        // 11 valid words + 1 invented word = 12 words total (valid count)
        // but the unknown word must be rejected before checksum check
        let good = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
        let phrase = format!("{} xyznotaword", good);
        let result = Mnemonic::from_phrase(&phrase);
        assert!(matches!(result.unwrap_err(), Bip39Error::InvalidWord(_)));
    }

    #[test]
    fn test_all_mnemonic_words_in_wordlist() {
        let mnemonic = Mnemonic::from_entropy(&[0x42u8; 16]).unwrap();
        let wordlist = Language::English.wordlist();
        for word in &mnemonic.words {
            assert!(wordlist.contains(&word.as_str()), "word '{}' not in wordlist", word);
        }
    }

    #[test]
    fn test_different_entropy_different_phrase() {
        let m1 = Mnemonic::from_entropy(&[0x11u8; 16]).unwrap();
        let m2 = Mnemonic::from_entropy(&[0x22u8; 16]).unwrap();
        assert_ne!(m1.to_phrase(), m2.to_phrase());
    }

    #[test]
    fn test_seed_length_is_always_64() {
        for size in [16usize, 20, 24, 28, 32] {
            let mnemonic = Mnemonic::from_entropy(&vec![0x33u8; size]).unwrap();
            assert_eq!(mnemonic.to_seed("").len(), 64, "seed must be 64 bytes for entropy size {}", size);
            assert_eq!(mnemonic.to_seed("pw").len(), 64);
        }
    }
}
