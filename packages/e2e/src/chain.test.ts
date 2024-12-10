import { describe, expect, it } from 'vitest'

import { api, check, checkHex, delay, dev, env, mockCallback, setupApi } from './helper.js'

setupApi(env.acala)

describe('chain rpc', () => {
  it('getXXX', async () => {
    const hashHead = '0x0df086f32a9c3399f7fa158d3d77a1790830bd309134c5853718141c969299c7'
    const hash0 = '0xfc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c'
    const hash1000 = '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc'

    await checkHex(api.rpc.chain.getBlockHash()).toMatch(hashHead)
    await checkHex(api.rpc.chain.getBlockHash(0)).toMatch(hash0)
    await checkHex(api.rpc.chain.getBlockHash(1000)).toMatch(hash1000)

    expect(await api.rpc('chain_getHead')).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', null)).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', undefined)).toEqual(hashHead)
    expect(await api.rpc('chain_getBlockHash', [null])).toEqual(expect.arrayContaining([hashHead]))
    expect(await api.rpc('chain_getBlockHash', [undefined])).toEqual(expect.arrayContaining([hashHead]))
    expect(await api.rpc('chain_getBlockHash', [0, 1000])).toEqual(expect.arrayContaining([hash0, hash1000]))
    expect(await api.rpc('chain_getBlockHash', [0, undefined, null])).toEqual(
      expect.arrayContaining([hash0, hashHead, hashHead]),
    )
    // hex number with incorrect bit length works
    expect(await api.rpc('chain_getBlockHash', '0x3e8')).toEqual(hash1000)
    // hex number works
    expect(await api.rpc('chain_getBlockHash', '0x03e8')).toEqual(hash1000)
    expect(await api.rpc('chain_getBlockHash', ['0x03e8'])).toEqual(expect.arrayContaining([hash1000]))
    expect(await api.rpc('chain_getBlockHash', ['0x03e8', null])).toEqual(expect.arrayContaining([hash1000, hashHead]))
    // alias works
    expect(await api.rpc('archive_unstable_hashByHeight', [1000])).toEqual(expect.arrayContaining([hash1000]))

    await check(api.rpc.chain.getHeader()).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hashHead)).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hash0)).toMatchSnapshot()
    await check(api.rpc.chain.getHeader(hash1000)).toMatchSnapshot()

    await check(api.rpc.chain.getBlock()).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hashHead)).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hash0)).toMatchSnapshot()
    await check(api.rpc.chain.getBlock(hash1000)).toMatchSnapshot()

    expect(await api.rpc('archive_unstable_body', hash1000)).toEqual(
      expect.arrayContaining([
        '0x280401000be3da72cc7d01',
        '0x852a041e00e102baec04ac369022e4faf43843117d7f81c2a430f03d159085b4d5deddeae29c079d0f1b16fe9f370e4e3945eacb8fa5b0d81a08d7231e77ad4aea3d0f3eae2983c2c4c6da4663d824809d8d82a8139ddfbe0e66662afb13154f73cfb587ac91bfb255080661757261202a21250800000000056175726101013cf655d71fd013dda7751c884028595444886861fe876d7e77fa2e113f9b24210e217a607e86c43ffb750c95eb2cdf35ce3680df52761453c3133e74f9e06c8ce6e37c00d5a63e0b9fe13a4aa596bbdb5673fb96e45518d61a6a46821b42aeda3c6ac2f00000500040887e207f03cfdce586301014700e2c2593eec2d17a76153ff51817f12d9cfc3c7f0400150180011080001ba3284d25379d5c873c15be73139bf02b9358dbd6292cc42cc4686b876f5a8086066aedb2810114ea92813be3b5e4e1fac2dbca1a47c13df09488afc2f686c71d0280046480c2574193fbbf18c903b0fd0fa840d672dd9e3524545fb24a4f45c228a1f297f780cd38800e3212342bff0e780c84adc8901ca21d40c99c6b37ef59589bfeb0e03c80a31a84bf92bcb5d16ee02f4c0f039b3119eb2b8f638316501fc50406d58a25d480a6c43f77bd1efe5c3ec006b3370928ca0ae7404121bc2bffe6f5a0a8a9f3390755035f04b49d95320d9021994c850f25b8e38509030000a000005000000a00000000c8000000c800000a0000000a00000040380000580200000000500000c8000000e87648170000000a0000000000000000c0d3cf8eb70000000000000000000000c0d3cf8eb700000000000000000000e8030000009001000a00000000000000009001004038000000000000000000000a0000000a0000000a00000001000000010500000001c8000000060000005802000002000000580200000200000059000000000000001e0000002800000000c817a80400000051019ef78c98723ddc9073523ef3beefda0c1004801f48957fac85fdf29fb1468fc5eb0cf8bfa4ae00cd0c5f9f0f7a36f33e1381c68083579bb39a5b39f845ac736df5ec06546ee3db275f1622848759152effdab3be4d0880ffff8042c42b2d23ee9cf3dd24ed49d3d534f2a2cd2a97882e34540b10504bf66898bc80ebae4feb173077e4eec45e1c6f6397511f51341c48b4a50b0a8aaa1278c753eb8048c1c71fc9f5ca385c7f782ac59ad231ca643937f1feae142328eff0872e9706803d5f115258d6c4aec3ab7b240adaa7114a5f0464ead35e07f204836f97ac880a80487716854a90fe44b041a983b018659e195c2a17342a627176be317510fcc5e98042669088044e642cf3b6aca51389c8c6bd8c09fae652108c65bb5e4bdc784e7c809588915f8ae7c5f87b2531de9309cb72e53c8702b87551d17666842d5efaf75e807fb80fd1ed5d5055851d105f9258af9f41386f5e21e64a39d443696024f57c40804dce9ecae12df140f5cdeb46ab6e2ffd055f2b789a1d548a8b4d036640307a94802bc6d68ce8dd80b61749f7498d335076d2f9a24ee83de4e5e984caa45014065f806d7c8cde6c8a420f50a224c2e16c27dcc76670db1eab79a35212d749f5a1f4f180cb15c9d21172d4f7b014c687c5f018826dd2f5ba6fc9144fed41f4138ee64f4d80d3ff08530bf5cd3510b86189bcf51297277481e38ce06116be926c4afdf91b18800d378cc4bc71818d4e4f6ad9895fc2f161b4b4d89db6f570efa02eae80b312c6809382d7089f6232cdbb803dda2a7ac8a7be1fd296c36649340fa7d42d63d1bcf68069b435aeaffa7685b3b784353f861b77058a1441701e0c6e3659c8e1734ab88b35049e710b30bd2eab0352ddcc26417aa1944fc1801c7426dbfea7cbb200d0a7fc8e48ef41ba8eee499c9305f5b6f4ade0607d131580bcb6b0a9491d8841e300bb21d3b7e5efac614297adf7ffdea7fec411a160828a805eb03dbd8df10f79dbe7df4e92c3122916df5225a1f4e54061ca3e471ecaf42d80437b62bfda087ab8d83e746b98eb521aafbd2029e8f0df53b840a68833c0f79b4c5f03c716fb8fff3de61a883bb76adb34a2040080e21ebaef887f2cd90b06d279831b7b52e5a5828ec9ebd58e448a811abf9d9be88000da721b8040754f9505232f55716a90453b3aea2f771d1ad4e32cb1bb32ab72800c02093f06681f30f9fa57f71c511b34cfc045ddbe3e7099355909d304585273150180080480750002cd272da2b86bd01db28179f8bb1b107a11dbf7187184e1a66e655534bc8009635f73f069d962700bbd4eb39f14f0024abeb1180819aca68c6dd21606162c1d028065008013d9835d449809cdc304c4c27d862170fb64446b24e5c10abac8bdc30de85704800686b905d49f9718c457660c3124873cc412003103bc7eeb2818a3db48cbe1ed809f284a86f45e0802b1d3be101948799c566e6927487026cf11fa7b27c5ed045d80af579d5ddc5c697d42bfc014076594e66c7b324cfd3017810c4e93e4f6f0ae9e1501804008806ebd29e5caedceeec9703c349433c8722e33020e5f2ad3e9383e91221e009946808c68f773671aec1db46b2c37b4c827e64aa7290d65e305cdaaa6b175596256f121019ede3d8a54d27e44a9d5ce189618f22d1008505f0e7b9012096b41c4eb3aaf947f6ea429080100801a24f5ecdd7db94b76d89df1e4a144212e1f4d44e0a4add94c4ee616392a54d7f8770d7fefc408aac59dbfe80a72ac8e3ce5b6ff6f7d467b87a9e803000080af1e9de2d72c2cdbfe5e0075b2f57cb522ddf642aabde2286f36f4a23ee293b0a1019d0da05ca59913bc38a8630590f2627c054080b18627caf3c7d5f5d316f6381a0d596f95cdc4e3a94622b4caa29b64ac7da6594c5f0a351b6a99a5b21324516e668bb86a570400804674404781f00366ab9f434da57d26dfe81550b8f8302b10fe4d8692a605b509a10280101780cc087090217e4d6d0065105a21a252e75e7fe873baad752fc9dc96c9d6908e4680fe06c6800e4ce995469c5bc87aee741a107ac3af47b3669e6b7592614f1796cc806e0dbbf4efa8308e881f995e527aafc88a1b806b598a7748dda909cb8cc84c3d8026d4b5c5d7545e2aa5b8ddda85a15a061c92e99906887a406c41713f92d6ea1180b82bc2aef23d07ca81d30146e6b4c8725325dd82e93876056abac1d9d6ecaeb37d059eb6f36e027abb2091cfb5110ab5087ff96e685f06155b3cd9a8c9e5e9a23fd5dc13a5ed2057424a1000000000685f08316cbf8fa0da822a20ac1c55bf1be3205f0d000000000000505f0e7b9012096b41c4eb3aaf947f6ea4290800008075cf3f08bab6ffeda6b1551c872f7d962bd3df14a393e615154540f56281f8aa80f9308f091f100659446bc94c5332bd7a8ed442723ae55144e27ff7646b5bbad680aa5abaaa8c5b2eb41a3855cfebb362efcab3bf20a37720c80f77db5434657d04800d49fef039517cc312c00412803ca1df50ac6d90c50541f649a9c85b83c0fdd880594d7409c9cd6f9707d94d0af07dfa47ec7ab089ac60cab441feaa78e07e742480bf74b14443c1ea178c8890cbc88d74edddb857c48ceea84b492dbfdb30f8316e80d8e8ea527588c761763766a2b64b7c5f2a85f320e6fe89f3b04b9493470b99a9685f090e2fbf2d792cb324bffa9427fe1f0e2068d17c00c7da7c007901800c2078767bbb460270642b5bcaf032ea04d56ab6ff6f7d467b87a9e8030000040080cbe683b14948af0537e71ed1f78a16adb32d22f7b90b892ff9f79e37c415dd67685ead6eef5c4b1c68eaa71ea17a02d9de2404e8030000bdc57c000000',
      ]),
    )

    await checkHex(api.rpc.chain.getFinalizedHead()).toMatch(hashHead)

    expect(await dev.newBlock()).toMatchSnapshot()

    await checkHex(api.rpc.chain.getBlockHash()).toMatchSnapshot()
    await check(api.rpc.chain.getHeader()).toMatchSnapshot()
    await check(api.rpc.chain.getBlock()).toMatchSnapshot()
  })

  it('header format correct', async () => {
    const header = await api.rpc(
      'chain_getHeader',
      '0x1d2927c6b4aca4c42cb1f88ed7fa46dc53118bb00370475aaf514ac88933e3cc',
    )
    expect(header).toMatchInlineSnapshot(`
      {
        "digest": {
          "logs": [
            "0x0661757261202b21250800000000",
            "0x05617572610101ba12b8f0cf97e0e0fcd885b889ae7e90b86277592690436b67eced4e0ef3e02ca094867287e94208a9d8a9e62402de9b4717247a6332bd55728420dbad0e8d8f",
          ],
        },
        "extrinsicsRoot": "0xe9033b0b86efaaa452fce2e3013806e480fa33195cfdd75d8263e5dc6acffffd",
        "number": "0x000003e8",
        "parentHash": "0x113384df3a413ca774ff5aebbef8045b9356493d9aeef5e59b036bd4bd3f21ba",
        "stateRoot": "0x33cb61d08934b1de5be3453801450f36082cb1a060cd760b427efc65e96be63b",
      }
    `)
  })

  it('subscribeNewHeads', async () => {
    const { callback, next } = mockCallback()
    let tick = next()
    const unsub = await api.rpc.chain.subscribeNewHeads(callback)
    await tick

    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    tick = next()
    expect(await dev.newBlock()).toMatchSnapshot()
    await tick

    expect(callback.mock.calls).toMatchSnapshot()

    callback.mockClear()

    unsub()

    expect(await dev.newBlock()).toMatchSnapshot()

    await delay(100)

    expect(callback).not.toHaveBeenCalled()
  })
})
