use smoldot::{
    json_rpc::methods::{HashHexString, HexString},
    trie::{
        bytes_to_nibbles, nibbles_to_bytes_suffix_extend,
        proof_decode::{decode_and_verify_proof, Config, StorageValue},
        proof_encode::ProofBuilder,
        trie_node, trie_structure, Nibble,
    },
};
use std::collections::BTreeMap;

pub fn decode_proof(
    trie_root_hash: HashHexString,
    nodes: Vec<Vec<u8>>,
) -> Result<Vec<(HexString, HexString)>, String> {
    let config = Config::<Vec<u8>> {
        proof: encode_proofs(nodes),
    };
    let decoded = decode_and_verify_proof(config).map_err(|e| e.to_string())?;

    let entries = decoded
        .iter_ordered()
        .filter(|(key, entry)| {
            if !key.trie_root_hash.eq(&trie_root_hash.0) {
                return false;
            }
            matches!(
                entry.trie_node_info.storage_value,
                StorageValue::Known { .. }
            )
        })
        .map(|(key, entry)| {
            let key = HexString(nibbles_to_bytes_suffix_extend(key.key).collect::<Vec<_>>());
            match entry.trie_node_info.storage_value {
                StorageValue::Known { value, .. } => (key, HexString(value.to_vec())),
                _ => unreachable!(),
            }
        })
        .collect::<Vec<_>>();

    Ok(entries)
}

pub fn create_proof(
    nodes: Vec<Vec<u8>>,
    updates: BTreeMap<Vec<u8>, Option<Vec<u8>>>,
) -> Result<(HashHexString, Vec<HexString>), String> {
    let config = Config::<Vec<u8>> {
        proof: encode_proofs(nodes),
    };
    let decoded = decode_and_verify_proof(config).map_err(|e| e.to_string())?;
    let mut proof_builder = ProofBuilder::new();

    let mut trie = trie_structure::TrieStructure::new();

    let mut deletes: Vec<Vec<u8>> = vec![];

    for (key, value) in updates {
        if let Some(value) = value {
            trie.node(bytes_to_nibbles(key.iter().cloned()))
                .into_vacant()
                .unwrap()
                .insert_storage_value()
                .insert(value.to_vec(), vec![]);
        } else {
            deletes.push(key);
        }
    }

    for (entry_key, value) in decoded.iter_ordered() {
        let decoded_value = trie_node::decode(value.node_value).unwrap();

        if let trie_structure::Entry::Vacant(vacant) = trie.node(entry_key.key) {
            if let trie_node::StorageValue::Unhashed(value) = decoded_value.storage_value {
                vacant.insert_storage_value().insert(value.to_vec(), vec![]);
            }
        }
    }

    for key in deletes {
        if let trie_structure::Entry::Occupied(occupied) =
            trie.node(bytes_to_nibbles(key.iter().cloned()))
        {
            if occupied.has_storage_value() {
                occupied.into_storage().unwrap().remove();
            }
        }
    }

    for node_index in trie.clone().iter_unordered() {
        let key = trie
            .node_full_key_by_index(node_index)
            .unwrap()
            .collect::<Vec<_>>();

        let has_storage_value = trie.node_by_index(node_index).unwrap().has_storage_value();
        let storage_value = if has_storage_value {
            trie.node_by_index(node_index)
                .unwrap()
                .into_storage()
                .unwrap()
                .user_data()
                .clone()
        } else {
            vec![]
        };

        let decoded = trie_node::Decoded {
            children: std::array::from_fn(|nibble| {
                let nibble = Nibble::try_from(u8::try_from(nibble).unwrap()).unwrap();
                if trie
                    .node_by_index(node_index)
                    .unwrap()
                    .child_user_data(nibble)
                    .is_some()
                {
                    Some(&[][..])
                } else {
                    None
                }
            }),
            partial_key: trie
                .node_by_index(node_index)
                .unwrap()
                .partial_key()
                .collect::<Vec<_>>()
                .into_iter(),
            storage_value: if has_storage_value {
                trie_node::StorageValue::Unhashed(&storage_value[..])
            } else {
                trie_node::StorageValue::None
            },
        };

        let node_value = trie_node::encode_to_vec(decoded)
            .map_err(|e| format!("Failed to encode node proof {:?}", e.to_string()))?;

        proof_builder.set_node_value(&key, &node_value, None)
    }

    assert!(proof_builder.missing_node_values().next().is_none());
    proof_builder.make_coherent();
    let trie_root_hash = proof_builder.trie_root_hash().unwrap();

    let nodes = proof_builder
        .build()
        .map(|x| HexString(x.as_ref().to_vec()))
        .skip(1) // length of nodes
        .enumerate()
        .filter(|(i, _)| i % 2 != 0) // length of each nodes
        .map(|(_, v)| v) // node itself
        .collect::<Vec<_>>();

    Ok((HashHexString(trie_root_hash), nodes))
}

fn encode_proofs(nodes: Vec<Vec<u8>>) -> Vec<u8> {
    let mut proof = encode_scale_compact_usize(nodes.len()).as_ref().to_vec();
    for mut node in nodes {
        let mut node_length = encode_scale_compact_usize(node.len()).as_ref().to_vec();
        proof.append(&mut node_length);
        proof.append(&mut node);
    }
    proof
}

/// Returns a buffer containing the SCALE-compact encoding of the parameter.
fn encode_scale_compact_usize(mut value: usize) -> impl AsRef<[u8]> + Clone {
    const MAX_BITS: usize = 1 + (usize::BITS as usize) / 8;
    let mut array = arrayvec::ArrayVec::<u8, MAX_BITS>::new();

    if value < 64 {
        array.push(u8::try_from(value).unwrap() << 2);
    } else if value < (1 << 14) {
        array.push((u8::try_from(value & 0b111111).unwrap() << 2) | 0b01);
        array.push(u8::try_from((value >> 6) & 0xff).unwrap());
    } else if value < (1 << 30) {
        array.push((u8::try_from(value & 0b111111).unwrap() << 2) | 0b10);
        array.push(u8::try_from((value >> 6) & 0xff).unwrap());
        array.push(u8::try_from((value >> 14) & 0xff).unwrap());
        array.push(u8::try_from((value >> 22) & 0xff).unwrap());
    } else {
        array.push(0);
        while value != 0 {
            array.push(u8::try_from(value & 0xff).unwrap());
            value >>= 8;
        }
        array[0] = (u8::try_from(array.len() - 1 - 4).unwrap() << 2) | 0b11;
    }

    array
}

#[test]
fn create_proof_works() {
    use hex_literal::hex;

    let current_slot = HexString(
        hex!("1cb6f36e027abb2091cfb5110ab5087f06155b3cd9a8c9e5e9a23fd5dc13a5ed").to_vec(),
    );
    let dmq_mqc_head = HexString(hex!("63f78c98723ddc9073523ef3beefda0c4d7fefc408aac59dbfe80a72ac8e3ce563f5a4efb16ffa83d0070000").to_vec());
    let active_config = HexString(
        hex!("06de3d8a54d27e44a9d5ce189618f22db4b49d95320d9021994c850f25b8e385").to_vec(),
    );
    let upgrade_go_ahead_signal = HexString(hex!("cd710b30bd2eab0352ddcc26417aa1949e94c040f5e73d9b7addd6cb603d15d363f5a4efb16ffa83d0070000").to_vec());

    let dmq_mqc_head_value = HexString(
        hex!("d205bfd64a59c64fe84480fda7dafd773cb029530c4efe8441bf1f4332bfa48a").to_vec(),
    );
    let active_config_value = HexString(hex!("00005000005000000a00000000c8000000c800000a0000000a000000c8000000640000000000500000c800000700e8764817020040010a0000000000000000c0220fca950300000000000000000000c0220fca9503000000000000000000e8030000009001000a00000000000000009001008070000000000000000000000a000000050000000500000001000000010500000001c800000006000000580200005802000002000000280000000000000002000000010000000700c817a8040200400101020000000f000000").to_vec());

    let updates = BTreeMap::<Vec<u8>, Option<Vec<u8>>>::from([
        (active_config.clone().0, Some(active_config_value.clone().0)),
        (upgrade_go_ahead_signal.clone().0, Some(hex!("01").to_vec())),
    ]);

    let (hash, nodes) = create_proof(get_nodes(), updates).unwrap();

    let decoded = decode_proof(
        hash.clone(),
        nodes.iter().map(|x| x.0.clone()).collect::<Vec<_>>(),
    )
    .unwrap();

    // active_config is updated
    let (_key, value) = decoded
        .iter()
        .find(|(key, _)| key == &active_config)
        .unwrap()
        .to_owned();
    assert_eq!(value, active_config_value);

    // upgrade_go_ahead_signal is added
    let (_key, value) = decoded
        .iter()
        .find(|(key, _)| key == &upgrade_go_ahead_signal)
        .unwrap()
        .to_owned();
    assert_eq!(value, HexString(hex!("01").to_vec()));

    // dmq_mqc_head is not changed
    let (_, value) = decoded
        .iter()
        .find(|(key, _)| key.eq(&dmq_mqc_head))
        .unwrap()
        .to_owned();
    assert_eq!(value, dmq_mqc_head_value.clone());

    // delete entries
    let updates = BTreeMap::<Vec<u8>, Option<Vec<u8>>>::from([(dmq_mqc_head.clone().0, None)]);
    let (hash, nodes) = create_proof(get_nodes(), updates).unwrap();
    let decoded =
        decode_proof(hash, nodes.iter().map(|x| x.0.clone()).collect::<Vec<_>>()).unwrap();
    assert!(decoded
        .iter()
        .find(|(key, _)| key == &dmq_mqc_head)
        .is_none());

    // current_slot is not changed
    let (_, value) = decoded
        .iter()
        .find(|(key, _)| key.eq(&current_slot))
        .unwrap()
        .to_owned();
    println!("{:?}", value);
    assert_eq!(value, HexString(hex!("873c991000000000").to_vec()));
}

#[test]
fn decode_proof_works() {
    use hex_literal::hex;

    let root = HashHexString(hex!(
        "4a8902b29241020b24b4a1620d0154f756b81ffbcf739a9f06d3447df8123ebd"
    ));
    let result = decode_proof(root, get_nodes()).unwrap();
    println!("{:#?}", result);
}

#[cfg(test)]
fn get_nodes() -> Vec<Vec<u8>> {
    use hex_literal::hex;
    vec![
        hex!("5703f5a4efb16ffa83d007000080d205bfd64a59c64fe84480fda7dafd773cb029530c4efe8441bf1f4332bfa48a").to_vec(),
		hex!("5703f5a4efb16ffa83d00700008420e8030000d4070000d6070000db070000dc070000f0070000f2070000f3070000").to_vec(),
		hex!("5c8c2de8299067f3070000d0070000d4e8030000009001000090010000000000000000000000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5d0452a22bee61fad0070000f20700005501e80300000090010000900100000000000000000001e41d29d36ff0b7c6007ec17b68ba6165066170fc67eb9755fbd7ed60bef647c100e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5d04d2a15ab51127e8030000d0070000d4e8030000009001000090010000000000000000000000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5d07edc4cbc65e03d0070000d40700005501e80300000090010000900100000000000000000001708391b220ce64bab1cc4f79559352e59882ee5bb58329085c2400079c56153a00e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5d0b652b2ae6ed1ddc070000d00700005501e803000000900100009001000000000000000000010a492e67d36615052a89ba50498ed5cf0a587b31fd6f3da464e5d111e4e8a81c00e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5d0be1ee506d55f8d0070000f3070000d4e8030000009001000090010000000000000000000000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5d0c472775baca93f0070000d00700005501e803000000900100009001000000000000000000013b264b3f72ecfeddbdad3b409887206a18d387f1b81856c0383014c9f559992000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e046fae65527199f2070000d0070000d4e8030000009001000090010000000000000000000000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e057a605f506cfcd4070000d00700005501e80300000090010000900100000000000000000001d3772d60305c2cbd7acf502a11881e0eef47fdfc85c7d2a0d6241e06ea4a971000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e36ad4314650419d0070000f00700005501e80300000090010000900100000000000000000001de18e43e692ffe15ea7a85abbce774e6944c56270a846777352827c7596f6c3e00e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e36c65ca123d5fbd0070000dc0700005501e80300000090010000900100000000000000000001c5120071fe1663a5a21b96d87446ac903ef1bf87dd729b8b9e92ca42ca303e7400e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e414cb008e0e61e46722aa60abdd67280b46e626e564d1385d21257d8cb59236ca125657f2a14bebd1af174317ca1055c").to_vec(),
		hex!("5e4361975d97255ddb070000d00700005501e803000000900100009001000000000000000000018c74408c28f6627f58a8e10b3ec06b98b0166bfb148641a35c5cdfc7a56e68fb00e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e4f36708366b722d0070000e8030000d4e8030000009001000090010000000000000000000000e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e55c8e02d73966fd6070000d00700005501e803000000900100009001000000000000000000019a436c9ae233f8b3cc6a379dc35ff6a3c4153b22a96db9fc81c9cee506a252b900e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5e77dfdb8adb10f78f10a5df8742c545840159a565b0fb89d8eec07b522e4e30e8bc29489ef7a9609dfec01855bd125d2e33").to_vec(),
		hex!("5ea99274c2ff3639d0070000d60700005501e80300000090010000900100000000000000000001d10c375b7f3756dd38a6fd0967fa4a92199606619c76c5aedc139eb584e8628b00e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5ec648b30353eed1d0070000db0700005501e8030000009001000090010000000000000000000100382d804f7b02c95c2d6b3b6a9cad2c97c2d7570bdfd32f8e8d961754b74b6d00e8764817000000000000000000000000e87648170000000000000000000000").to_vec(),
		hex!("5ee678799d3eff024253b90e84927cc68013c6d5340826d75f6258aad1cf4478c20cae5bbaf189e2fe6e0c997aec0a8c3c").to_vec(),
		hex!("5f04b49d95320d9021994c850f25b8e3852d030000a000005000000a00000000c8000000c800000a0000000a00000040380000580200000000500000c8000000e87648170000001e0000000000000000e8764817000000000000000000000000e87648170000000000000000000000e8030000009001001e00000000000000009001004038000000000000000000000a0000000a0000000a00000001000000010500000001c8000000060000005802000002000000580200000200000059000000000000001e0000002800000000c817a804000000000200000014000000").to_vec(),
		hex!("800014808fc31cedc9f5a694fdde1823788928749f52e1c637dfbf315637fd89eace451c80b58f7e709e14c8ad32651a7b6f13b2ee8aa4a9566413b985e64eb5f3918a58e9").to_vec(),
		hex!("800102802dcdd284f422a6ebda6a6f25c88e3ffe11d1adba81950ba92c640b042c250b1080c3883d3173954c1f95c3cb0612d3445f79eaf866255c3261671c3d50a480dcca").to_vec(),
		hex!("80011080453fad35c0a01e1a2af068a21c24622fe089db8330ff1c3d52d3a00c7504e515800ebe650369ce0e3ce85b22816181f598cc6ecf7a3b22314357ab4181b9ccb867").to_vec(),
		hex!("80011080bfead2545bbb18bbeccbbc42e419ce81be803a019bc10bc035e040209109ca708029f01a3bcd0dedb0dd8e6953b1c52deb161fb6f06b943a1934bd80506ac8f8ff").to_vec(),
		hex!("80046480f2126bccffb3e85172709b56414860c2d5aef6fbdca97efb91b0c7989b2e767c809bbc710130cd3fd1008762577f5a4f1959819fefe31aa2eb38c950b5b0ac16748022cba5584bc0982277b50978b65dd7c8c3702937804ae5b16b7b2dbae18122ff80c2e805afdfad80977cb420fe3c56c481131d8e6575e9dac18bfb48ee70bc5a93").to_vec(),
		hex!("80080480b64e0437daeee2d16022caa8e4cb67d9bfff7c5feb34dbbe044da77783421f78809ffe6dc440b4ca64053f01647b2e2d3284a4be15517f6693ee26fe4a84cc8a7b").to_vec(),
		hex!("8008208057bb9d54329c52084dafd34bb7a12ae243ed81b29438b7941ad6b08bc0aab080485ead6eef5c4b1c68eaa71ea17a02d9de0400").to_vec(),
		hex!("8008c280666c2b4c33ef871664a1cd5f75688bd687415a95f52a12fdaff5e1bb1d714f958049da90db410ddc5fcb63a6ba31fff1140f1f027eab9f575207946938a6dff0498032b1eb1b88050e8be5253bc631c21e5bb73b440ae1188f1da9e141aea5050345800892f12109affae95d1fa83c3e98639ce4aa22b3317846989ac8cc46a37ff2bf").to_vec(),
		hex!("801017800bd4a887368b253b446f6743e0b8b47e3384a11be255c56869ac5c22c8989dd8800bce23fe3d2d5b8d0e3a26b96ca234ad713326991a44cb1f30acd20cb8eb400080b47bdf3c44e033a0f6273db0e4d3c805462f92c8ec58046e6ece49d93264edaf80ea85a25e4978d8d9281242dec4943257cfb4d14f3408640b5e643f247d38a91c808a15b3c07f5df5f0771146cf6adb06d2d2af1c9c569c70e42d3d881e60c49cb8").to_vec(),
		hex!("801040809d953a8e74f031a6e10d7532012f6e655a37c85c4e37454174b98a7b92ced3f9805f738e2d7016159bb83f0acfc05b94f3bfed39826328fbea9a5a6844b0ee9f62").to_vec(),
		hex!("801200802c2bdbfc1bde7cdde01a4db7315c02e0373e1c8b826258e135ded3ca12b9b0e580a18673b451b154098a7a400495526a375c86a62e3c8f6def0a67b00eb6d26e87").to_vec(),
		hex!("80132680db8ba95d9fa6771a636c09a99827a9ef71777f6507eb4f789de5e137a7250d3780d99bcdfbfe4d2ba16f4dfaa93a02a3853cbc7912bad01d8f89acd4a18e318e9d807e84d35633382d5c74d5c446d26db1cc01db605ba0c12d399849032872bb731280ac082de8a8e688e9aa6c8d9f06576be0b982e6f7229e7b1f3a0d0cbff4e9cbce80e8f2d389ed545a028c6321d265c650179ed1c671fcfbc417185682c21667059b80a512dfa55fcf04f7e26b5ccdc14466086df66928a4f54dfb12b9873108dbfe88").to_vec(),
		hex!("8028388028462a6785718dce363f9fa86db6e6885c1df439739c06df2670b71ca7d1d6ab80f12b3be1de5704b86affeaf4178a0ca8dea056893c12a03c3500ca8af78c128080ae634ca22841dbcd3de33dfcd0730d87335dc93786dec63ff9ff5c494b1c32d2802166c372b218427bae449c6e50a075b4bc604253cea4ad0ee8ee7c16b498f3e9808b81a047e908564423ad8d63ef1677199bb5d41570df5ce359ec0cdc5a66fc06").to_vec(),
		hex!("80324680aa309aa88e45c23a7b3361cb9ac5bde5896dde657e8a562ce46cd5587674824080f7f61a745a9fefb91f35658a78ebc397ad0514232c0eec10344331b9a29195b680480c6b47252c3414177fcd8441cc689703241343e1ef84be0b206cc24b043f1c80608329e88f9837bedc55fa039c1c5468fe76304edacab49f89a35685ce0492748043a4144332df717cb9ac20b2b490345f22543965ea5272ce3511fa98f4ddfdcb80c62f5d20c25775fb8a8abded53ae1f6abd8fb9f9d75e306a1973194a9a739f73").to_vec(),
		hex!("804008804c9c79007d5b06217f77869639dbf475761b1d45115441ea15641d7db01d2425808c68f773671aec1db46b2c37b4c827e64aa7290d65e305cdaaa6b175596256f1").to_vec(),
		hex!("8041088041558830b346eebf7648fb84310d961de185de6ebc1bd22d114980d7793d6ee1804e23dcce96d9e514271688cf0bc5581e5e6e74cc4e079c39e75490ac45272f668071daa4762bcd3732d275bee68e3bb098a140029d7b01e82b4cd106924313f9f6").to_vec(),
		hex!("80505480a1fc2c779380c33b94b304c281e55ca5a0807804fe9530c22fdfa76628beb42680a1a8a2d4670241007470d59433dc876b10443654c68ee2c22e43f0505fb7081380cbc649bccb6cbe2678b258eb56b9985865852f8dc3ca4ac4608b46dc9a61a56580379357c2c5523ead8e26c2bd4d0ce06ca7f1726b09ef513a7d501aaa5752368280692755c9209155bd724071de137657f492de5bb5479738d1af7119739b4df473").to_vec(),
		hex!("80650080021eceb7212a84c0ce28538807a932d56f7ca04ad18a37eb5a3d81cf2d3a1e888028c2012c52668080a70a29a2704a0e1d108658aa94f21e0dcd5103401c52fff3809264b71d425330b4faf06bc3855662ae7511e854ed5387b3ee8c3fafcd6772d080af579d5ddc5c697d42bfc014076594e66c7b324cfd3017810c4e93e4f6f0ae9e").to_vec(),
		hex!("8080018068269bb8490669b94a5f1e0c3b4864e03224a2048271f11b8a95ea6168756573805dc031eeca4040dfb7be6e148287360e67d5ce62125f23d912e7ba6b5e1c3ea8").to_vec(),
		hex!("8086108046ea793674e4b7c40067c83aa00ac2fbbf3d2ebd57e01d5065909769da0ea9a2801eacd1970b27e7428c46fc7a1cd539390d664880f8665d1f5d9df711aef78ffc807b7ad6eb73914fd07fc55ad89ba771070c1da532a9269475dc64f1995d4d92668044a0d27ae2362402e5ac6666cbfd7bcaa530f2ea97a73b328a13ece4264ea290").to_vec(),
		hex!("80a06b8001abdee51ff39c1b87147abb00a81ce05a7b7bbd43dc1509cb4d97acdf3f8e6d80a296acd1c3810d5724e101343410a44934ed827a0c6931e538c2fc095adac046806661dfd17874a64f7f8e2a1e88db6fe81031f845e8705d6470bd48bef2d9615080df3c444cc602cfb8e35514a12c70fe2f5b2ec2683a3e19889c2bce42e8df423180decf6a9a942e385c520acce9b20917c7a516fee686baab2ca15379828a54ec09808cc9995c94f73aec7861dcd2bb4e389eefad87f4d8c1ece831dbcae8c85f2ab4808bbdb281c19f2e0405ebdcdd3eed583c83be8c5bf317070ab8e144c77aecab54").to_vec(),
		hex!("80a090809d70976e45bed6bfbe01cc3a2d2fc8d707784be7b54c5910eda9d60dbaa8dcda80c7d17ef601008c6b5fb577a67c8c0ed8f8a1b4eea0109830cddfc3d05c5955b8808fac6f5b26a0a091512ba579c768e78cd75b5f91ff02dcd27a011a1b9d3f8ca0805fc8b08bf7e5d96506fca5e15f58b00e5857510be132ddf21222fdc441242af5").to_vec(),
		hex!("80ffff80c66d277de66aaf06e0d6a1fc26ce21d8f6ef50ff28e14dbccfb2fa5bfbd0e5d680f219622acbd014476d4edb56ff6b86554c683a93a217b9ee5449d5f97350aba980daacb402b9d9534826030a1a087c3a6064f823d9578216b50dcc839b4a1cb4f080538c5f0315259d01b9589faf05886e3222ad437f11afbc79f8ca8fd1a706948b803b47dc6cc57a291d93e562eb748a4f6d5ba08cbd1b4b9980117eceff1ce541f08080b4dd653d14508ffe4e711984c6daebb8c53ffc701bc6c390f170524fe6067e806881eae5c901b2f9da23fc14a7b5c5adddf42803d9e6f6457502263d5c20d1b180552af8589e75bd85f77e14ad29a64b58bf27795087e0f8405f00e0af8c44769180f778234884d04539ae5ee94481786900f08bec239bc9e8a495e44f56ae62bd6f8058c056dc712c11a8aacceb99692e0b12b11fa7d127c512373d6a9312e4b7aa12800b7d692bbe193862e80155a0c60d515e359fc0711797aa73b963f8de206372318032b4da4f9707c28268fda915bad17740b2f29044af3426b93dddb1525d9119a180712826eb964d50810e03c64f0465e9d0aefba0975922e3546c1dd289ae6485ab803fc6afb3bb1a772c1b7865d617175918a1e561e7f9f6d4b3727e2e77d8cd54fd80b84b7a6e9b8ac582dfe53a66e6da54a2bc42162390b409a4fb1cb4d99e823334805ab928b4a3b5103f34f6d934e7c2a71a08f6160242d5a25e8d395f022137b544").to_vec(),
		hex!("8109400180c7192966ab02c8fe706a869d280b1f9e4100cd344a11d14d330d2691c06d838080cc5ba161e4197291e156c96df507a376d778fdd94adb9db8cc0f457222957ed9").to_vec(),
		hex!("810f080880d066a00dc79b0a8601ea466d09a4c969c246ed7d8b4f029afcd41944e33ae8b08063fee100c551b8c3283651ee6d6aad37bbe2abd5830b3c17785b691c63857dc5").to_vec(),
		hex!("9d0da05ca59913bc38a8630590f2627c07d980d131600ec39249fb7e25ce8b2759cbe5d9d22d65865cbdc5d5b6b43442a037a28064d55117d3f84fb235f2051b42475f6a3c165cb066016a54582116560d278c0180868f6dfc79ccadf3a96cf90a2b80fcc7fe47c77e30cbb2c8b88a6f3ee21a7c0a8039ebc92b31a26e4935b2e3ac747dfd531b73be08467c9918cc70090e0ae8859b80090170c9487096f84239151a9ecf92c1efeece708d87844f19f56988ec479a0d80a83b5e3737bfc99ede5e597406cf5b001b7949a5315953134fc321fc8992c0bd80fe20d9a744142b01474930a28d8b9a5ef3c851504a99fed5a4fec46d0533c7d88015dd6cf6cccb6c66a9e56feb41c47cf30a31d39fa77ec8b2eb55dd742db53921").to_vec(),
		hex!("9e207f03cfdce586301014700e2c2593414080776fdf331ededb557c273c87efa8d2e3919d6745e8645214665bf43afed8b5e9685f0d9ef3b78afddab7f5c7142131132ad42001000000000000004c5f0ec2d17a76153ff51817f12d9cfc3c7f0400").to_vec(),
		hex!("9e710b30bd2eab0352ddcc26417aa1944fc380926c6b63b2fdc00d98403a06793b323674ed75b32e75389a2c9d19140f48d07b80db9c2d25d50f7d4f8c69ee037a096b488bc42e33d2cfeeeff1fe8fc22c8cc1788034979b2e5ea91011d05f74f35d25c5b0da29c03c2c0e8e6b9f0a49ca32f46e58800e21335793e29a09c8eac52a4ed197378fd1ac3552ff31aecddb063d3f2c2f314c5f03c716fb8fff3de61a883bb76adb34a20400803587aeceb149eff2f59b5270a01e8c4fd19d1722eab53bcd8b5fd2aee0606fc14c5f0f4993f016e2d2f8e5f43be7bb2594860400807d9800e301836dcc17032891ceff52fc4029dcef8fc74a471e164eb06eecadaf80ac20693eb2298f6f300752834c3fc31a3c075a4e9a77a67d7ee3d6982d70e3e1").to_vec(),
		hex!("9eb6f36e027abb2091cfb5110ab5087ff96e685f06155b3cd9a8c9e5e9a23fd5dc13a5ed20873c991000000000685f08316cbf8fa0da822a20ac1c55bf1be320cc15000000000000505f0e7b9012096b41c4eb3aaf947f6ea429080000805788707c580bffc1660dc8c31ca562b5adf72d7dda390c9016319224cedab6c08084a80a22d77d8016adc89610b528c15ba17e4522a53faec0e60d84f5130362a580950cc9876d11a25f6c56e833f048b7fc32caf0bfbb8d9ff4b6ea993f4e984698800d49fef039517cc312c00412803ca1df50ac6d90c50541f649a9c85b83c0fdd8807a5d73d6c6a648545a7a8de535f9a12c2f7105d012e0eb272d91fb8ec018a2bf80cc59c8e5010713cf8876c314769c49fbe0b9a6e131ebf5a9774f52fe73d9ac66800c999e682e20f4c5ab236641829330b52e9a60e3bb8295c671ae10b0078b1b39685f090e2fbf2d792cb324bffa9427fe1f0e20b94ccb00fa55cb00").to_vec(),
		hex!("9ede3d8a54d27e44a9d5ce189618f22d3008505f0e7b9012096b41c4eb3aaf947f6ea4290802004c5f03b4123b2e186e07fb7bad5dda5f55c00400806b5403551f8463a3ddf5063c0454a5bd46c9c3d2e1030a6a838a27cc0c4b983a").to_vec(),
		hex!("9ef78c98723ddc9073523ef3beefda0c1004809efa6d0e486c88a89d0cec81b8d06f9b5b1dcff9db2c44a9bca135e300ee700c80a8a03c435efb3b22807974e7d4ef1ebad070a3e9c608ed0e5112c1d7223ca5ea").to_vec(),
		hex!("9f012b746dcf32e843354583c9702cc020cabb80ff9bed925038b8804f63090b1e2cf36d0d987e2e85b24f046ceee2d849dd69ff80d11d71ea91a8cbe9858770d23355ed19ad19a263b94d55f6d6f503c17eb3dd5280bb7fd6b2fa22db69bca4f70304addc539798fc6174ddae0c5865c71ff96e53415c5700bd9a93e85e3ce1d20700002408d6070000dc07000080b67cef76f1fdf97b48c1fcba9594f1ae40742c195b8d950ae7f08e4b3314fb2780fd53aee7d7ccb0767af55024401273b0a9437c5917cdd60d406dac4aab722333801bff773d6d6d765292b4e595ee0cd425bebe341c2f21af1768896cbfb71cc5d04c57077a93d174890f1ff20700001404d0070000806e5feeb98858d49ab4f600b9337280df82041595257c4d566175cbf59cc105f680f44d2eba0587ca4f414fe092f163abb43531c554c28cfcc26cf032083a7af9b4").to_vec(),
		hex!("9f06604cff828a6e3f579ca6c59ace013df7ff801afb0ed9ee8eab53f55af9e9f1c49736c6186c5852d7bba27baeab053a2d22fc809c793f0292c00ae878a17876cc7fe3343623734664aeb50333eac67dd4077b40808aaa7d061d20c8b96edc45a36746cfc2f8645b20db12f51ca020ed4967049c20804c9d12d0f9b7ab988d1ed94f3972945784bf8fb75767e41b3dc5f12410377c5c8048ddad220fd43771ed93688597e2e167308755101c343e6d465739e1f748a699806ae40eb731b53990d314bc9635edeb0f4f45870cf3d6db37bf48d2343547d2cf8005198aaee0fd5761c623207eea8ad53f057e9de0446cd00c23da5ff1c8183ec7809621a90e7fa3e8ed459a6e474ef84a300363f0d245d36a0851a191240462d6e680e2d358899753b8e0b96e95191efba0fba2333c8e526737b6976fa7b413cfa3b980f42207a985ccdcd35ae1ff027a2611b93edb846fe723806a980b082e6328715f809e314bdc1d2c60c13fd046b06bc81c65bcaad55d821e83a9c2dc31293e5ae21780f08e4a062dfbb903d956382db84eadd0bf0a7b2b8468d8cfed83802de874a67b80424742990c218a746f5754b3a2c769a9ecbb457500412b0281ebb4304054067880b5407c24baa40b063e62c1d162c55f4a646edd70607bcbaef3808211db13013780eba4585adb29d3256f8059f81a40517e63b12c41ef7c0a8726a4ba62701e3598").to_vec(),
		hex!("9f0d3719f5b0b12c7105c073c507445948cabb800ff6a2c0cf1c6e2dd1cad56d23aa6f51a78d85792606966afc176ecb4101e51b802db7d1beaf4152abcbe2d72358d938f31eef2e6f9adb322dd6316cd211dfe79580bb7fd6b2fa22db69bca4f70304addc539798fc6174ddae0c5865c71ff96e53415c5700bd9a93e85e3ce1d20700002408d6070000dc07000080054bc6bd08b77192f231932a6e63a3f54a48d954725a2198a762781089bf150980fd53aee7d7ccb0767af55024401273b0a9437c5917cdd60d406dac4aab7223338019cbbdbf60cd90027c802d921f737c07a073bb4bed3b9ff0c37b26506e6aafc94c57077a93d174890f1ff20700001404d0070000806e5feeb98858d49ab4f600b9337280df82041595257c4d566175cbf59cc105f680f44d2eba0587ca4f414fe092f163abb43531c554c28cfcc26cf032083a7af9b4").to_vec(),
		hex!("9f0d7fefc408aac59dbfe80a72ac8e3ce5cebf80b9cbd0d700a17a0e4c717af58b887e80c0bce7832e64817caa8b47152baf5ba0807e1ee2c8362cd0745aa0c58780b99fefa1024c1b472d3386a2319e71b68028a68012d23785dbec11744e5f0fef2c34efcb738891240cd4ad63bb101bd4c2512a0980152c557d36cdee4289c8b2c42462576e238b62422b257e91773a473f49c3858680a8842b069c158af198d7d570838f69a2f4c9a218d51c69ad60361a873a11bbea80f08851397f0db3ac9785de1017f41cb5b073b92ecf6b4653d1f38d4993028e4680117820f0023f9e54736ad10ecae8806bcf1cc8b4ed694aa530ed85e6361db7ea80be32eae63e4a223cdf5cbf90b66f48665668ec0bedbb6b76302768ea6f3b19cc8030b143a144cc26437db830e7d750f21dbc87cf3140097b1fdbddb697782a237180ec76035be1c7d52a15dcf76aaf69fced1772f1464ec7886952dada14030ad4fc809b912d6aa76e61c4b515535db14d28490924ef2007cf19e0022b5a089b6d010380f28a57be8a23f6a2588595e53cb640bbeeee2ef9ddc962a6672ac98bd2d6ea4e").to_vec(),
    ].into_iter().collect::<Vec<_>>()
}
