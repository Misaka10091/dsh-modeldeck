"""Read-only ASAR inspection; all output stays beside this helper."""
import argparse
import json
import pathlib
import struct

ARCHIVE = pathlib.Path('C:/Users/xiaoxi/AppData/Local/Programs/DeepSeek Harness/resources/app.asar')
ROOT = pathlib.Path(__file__).resolve().parent

def entries(node, prefix=''):
    for name, entry in node.get('files', {}).items():
        path = f'{prefix}/{name}' if prefix else name
        if 'files' in entry:
            yield from entries(entry, path)
        else:
            yield path, entry

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extract', nargs='*', default=[])
    args = parser.parse_args()
    with ARCHIVE.open('rb') as stream:
        head = stream.read(16)
        pickle_size, header_size, payload_size, json_size = struct.unpack('<4I', head)
        header = json.loads(stream.read(json_size))
        data_start = 8 + header_size
        files = dict(entries(header))
        manifest = {'archive': str(ARCHIVE), 'size': ARCHIVE.stat().st_size,
                    'header': [pickle_size, header_size, payload_size, json_size],
                    'data_start': data_start,
                    'paths': [{'path': p, **e} for p, e in files.items()]}
        (ROOT / 'asar-index.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        for path in args.extract:
            if path not in files:
                raise ValueError(f'Not an archived file: {path}')
            entry = files[path]
            if entry.get('unpacked') or 'offset' not in entry:
                raise ValueError(f'Not an archived payload: {path}')
            dest = ROOT / 'extracted' / path
            if not dest.resolve().is_relative_to((ROOT / 'extracted').resolve()):
                raise ValueError('Invalid output path')
            stream.seek(data_start + int(entry['offset']))
            payload = stream.read(entry['size'])
            if len(payload) != entry['size']:
                raise ValueError(f'Short read: {path}')
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
            print(f'Extracted {path}: {len(payload)} bytes')
        print(f'Indexed {len(files)} archive entries')

if __name__ == '__main__':
    main()
