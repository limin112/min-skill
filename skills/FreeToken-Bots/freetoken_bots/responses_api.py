"""OpenAI Responses API <-> Chat Completions translation.

Codex CLI (>= 0.1xx) only speaks the Responses API (`wire_api = "responses"`),
while free upstream models speak chat-completions. This module converts a
Responses request into a chat request and converts the chat result (streamed
or not) back into Responses objects / SSE events.

Supported: text + image input, function tools, custom (freeform) tools mapped
to a single-string function, tool calls and tool outputs, streaming text and
tool-call arguments, usage. Dropped with no error: hosted tools the upstream
cannot run (web_search, file_search, ...), tool namespaces, reasoning items
(encrypted reasoning cannot be replayed to a different model).
"""
import json
import time
import uuid


def _id(prefix):
    return '%s_%s' % (prefix, uuid.uuid4().hex[:24])


def _content_to_chat(content):
    if isinstance(content, str):
        return content
    parts = []
    for c in content or []:
        t = c.get('type')
        if t in ('input_text', 'output_text', 'text', 'summary_text'):
            parts.append({'type': 'text', 'text': c.get('text', '')})
        elif t == 'input_image':
            url = c.get('image_url') or (c.get('file_id') and None)
            if url:
                parts.append({'type': 'image_url', 'image_url': {'url': url}})
        elif t == 'refusal':
            parts.append({'type': 'text', 'text': c.get('refusal', '')})
    if all(p['type'] == 'text' for p in parts):
        return '\n'.join(p['text'] for p in parts)
    return parts


def _output_to_text(out):
    if isinstance(out, str):
        return out
    if isinstance(out, list):
        return '\n'.join(_output_to_text(x) for x in out)
    if isinstance(out, dict):
        return out.get('text') or out.get('output') or json.dumps(out, ensure_ascii=False)
    return str(out)


def convert_tools(tools):
    """-> (chat_tools, custom_names)"""
    out, custom = [], set()
    for t in tools or []:
        typ = t.get('type')
        if typ == 'function':
            fn = {'name': t['name'], 'description': t.get('description') or '',
                  'parameters': t.get('parameters') or {'type': 'object', 'properties': {}}}
            out.append({'type': 'function', 'function': fn})
        elif typ == 'custom':
            custom.add(t['name'])
            out.append({'type': 'function', 'function': {
                'name': t['name'],
                'description': (t.get('description') or '') + '\nPass the raw tool input as the "input" string.',
                'parameters': {'type': 'object', 'properties': {'input': {'type': 'string'}},
                               'required': ['input']}}})
        # web_search / file_search / namespace / local_shell / mcp: not portable, dropped
    return out, custom


def to_chat(body):
    """Responses request -> (chat request, ctx). ctx is needed to map results back."""
    msgs = []
    if body.get('instructions'):
        msgs.append({'role': 'system', 'content': body['instructions']})
    items = body.get('input')
    if isinstance(items, str):
        items = [{'type': 'message', 'role': 'user', 'content': items}]
    pending_calls = []

    def flush():
        if pending_calls:
            msgs.append({'role': 'assistant', 'content': None, 'tool_calls': list(pending_calls)})
            del pending_calls[:]

    for it in items or []:
        typ = it.get('type') or ('message' if it.get('role') else None)
        if typ == 'message':
            flush()
            role = it.get('role') or 'user'
            if role == 'developer':
                role = 'system'
            msgs.append({'role': role, 'content': _content_to_chat(it.get('content'))})
        elif typ in ('function_call', 'custom_tool_call'):
            args = it.get('arguments') if typ == 'function_call' else json.dumps({'input': it.get('input', '')})
            pending_calls.append({'id': it.get('call_id') or it.get('id') or _id('call'), 'type': 'function',
                                  'function': {'name': it.get('name'), 'arguments': args or '{}'}})
        elif typ in ('function_call_output', 'custom_tool_call_output'):
            flush()
            msgs.append({'role': 'tool', 'tool_call_id': it.get('call_id'),
                         'content': _output_to_text(it.get('output'))})
        # reasoning / web_search_call / others: skipped
    flush()
    # chat APIs want system messages first; merge any later ones into the first
    systems = [m for m in msgs if m['role'] == 'system']
    if len(systems) > 1 or (systems and msgs[0]['role'] != 'system'):
        text = '\n\n'.join(m['content'] if isinstance(m['content'], str) else _output_to_text(m['content'])
                           for m in systems)
        msgs = [{'role': 'system', 'content': text}] + [m for m in msgs if m['role'] != 'system']
    tools, custom = convert_tools(body.get('tools'))
    chat = {'model': body.get('model') or 'auto', 'messages': msgs, 'stream': bool(body.get('stream'))}
    if tools:
        chat['tools'] = tools
        tc = body.get('tool_choice')
        if tc in ('auto', 'none', 'required'):
            chat['tool_choice'] = tc
        elif isinstance(tc, dict) and tc.get('name'):
            chat['tool_choice'] = {'type': 'function', 'function': {'name': tc['name']}}
        if body.get('parallel_tool_calls') is not None:
            chat['parallel_tool_calls'] = bool(body['parallel_tool_calls'])
    for src, dst in (('max_output_tokens', 'max_tokens'), ('temperature', 'temperature'), ('top_p', 'top_p')):
        if body.get(src) is not None:
            chat[dst] = body[src]
    fmt = ((body.get('text') or {}).get('format') or {})
    if fmt.get('type') == 'json_schema':
        chat['response_format'] = {'type': 'json_schema', 'json_schema': {
            'name': fmt.get('name') or 'output', 'schema': fmt.get('schema') or {},
            'strict': bool(fmt.get('strict'))}}
    elif fmt.get('type') == 'json_object':
        chat['response_format'] = {'type': 'json_object'}
    if chat['stream']:
        chat['stream_options'] = {'include_usage': True}
    return chat, {'custom': custom, 'model': body.get('model') or 'auto'}


def _usage(u):
    u = u or {}
    inp = int(u.get('prompt_tokens') or 0)
    out = int(u.get('completion_tokens') or 0)
    return {'input_tokens': inp, 'output_tokens': out, 'total_tokens': int(u.get('total_tokens') or inp + out),
            'input_tokens_details': {'cached_tokens': int((u.get('prompt_tokens_details') or {}).get('cached_tokens') or 0)},
            'output_tokens_details': {'reasoning_tokens': int((u.get('completion_tokens_details') or {}).get('reasoning_tokens') or 0)}}


def _call_item(ctx, call_id, name, args, item_id=None, status='completed'):
    if name in ctx['custom']:
        try:
            inp = json.loads(args or '{}').get('input', '')
        except ValueError:
            inp = args or ''
        return {'type': 'custom_tool_call', 'id': item_id or _id('ctc'), 'call_id': call_id,
                'name': name, 'input': inp, 'status': status}
    return {'type': 'function_call', 'id': item_id or _id('fc'), 'call_id': call_id, 'name': name,
            'arguments': args or '{}', 'status': status}


def _response(rid, ctx, status, output, usage=None, routed=None):
    r = {'id': rid, 'object': 'response', 'created_at': int(time.time()), 'status': status,
         'model': ctx['model'], 'output': output, 'parallel_tool_calls': True,
         'tool_choice': 'auto', 'tools': [], 'error': None, 'incomplete_details': None}
    if usage is not None:
        r['usage'] = usage
    if routed:
        r['metadata'] = {'ftb_model': routed}
    return r


def from_chat(data, ctx, routed=None):
    """Non-streaming chat completion -> Responses object."""
    choice = (data.get('choices') or [{}])[0]
    msg = choice.get('message') or {}
    output = []
    text = msg.get('content')
    if isinstance(text, list):
        text = ''.join(p.get('text', '') for p in text if isinstance(p, dict))
    if text:
        output.append({'type': 'message', 'id': _id('msg'), 'role': 'assistant', 'status': 'completed',
                       'content': [{'type': 'output_text', 'text': text, 'annotations': []}]})
    for tc in msg.get('tool_calls') or []:
        fn = tc.get('function') or {}
        output.append(_call_item(ctx, tc.get('id') or _id('call'), fn.get('name'), fn.get('arguments')))
    return _response(_id('resp'), ctx, 'completed', output, _usage(data.get('usage')), routed)


class StreamTranslator:
    """Feed chat-completion chunks, get Responses SSE (event, data) pairs."""

    def __init__(self, ctx, routed=None):
        self.ctx = ctx
        self.routed = routed
        self.rid = _id('resp')
        self.seq = 0
        self.output = []        # finished items, in output_index order
        self.text_item = None   # {'id', 'index', 'text'}
        self.calls = {}         # chat tool index -> {'id','index','call_id','name','args'}
        self.usage = None
        self.next_index = 0

    def _ev(self, typ, **data):
        data['type'] = typ
        data['sequence_number'] = self.seq
        self.seq += 1
        return typ, data

    def start(self):
        r = _response(self.rid, self.ctx, 'in_progress', [], routed=self.routed)
        return [self._ev('response.created', response=r), self._ev('response.in_progress', response=r)]

    def _open_text(self):
        evs = []
        if self.text_item is None:
            self.text_item = {'id': _id('msg'), 'index': self.next_index, 'text': ''}
            self.next_index += 1
            item = {'type': 'message', 'id': self.text_item['id'], 'role': 'assistant',
                    'status': 'in_progress', 'content': []}
            evs.append(self._ev('response.output_item.added', output_index=self.text_item['index'], item=item))
            evs.append(self._ev('response.content_part.added', item_id=self.text_item['id'],
                                output_index=self.text_item['index'], content_index=0,
                                part={'type': 'output_text', 'text': '', 'annotations': []}))
        return evs

    def _close_text(self):
        if self.text_item is None:
            return []
        t = self.text_item
        self.text_item = None
        part = {'type': 'output_text', 'text': t['text'], 'annotations': []}
        item = {'type': 'message', 'id': t['id'], 'role': 'assistant', 'status': 'completed', 'content': [part]}
        self.output.append((t['index'], item))
        return [self._ev('response.output_text.done', item_id=t['id'], output_index=t['index'],
                         content_index=0, text=t['text']),
                self._ev('response.content_part.done', item_id=t['id'], output_index=t['index'],
                         content_index=0, part=part),
                self._ev('response.output_item.done', output_index=t['index'], item=item)]

    def feed(self, chunk):
        evs = []
        if chunk.get('usage'):
            self.usage = chunk['usage']
        for ch in chunk.get('choices') or []:
            delta = ch.get('delta') or {}
            text = delta.get('content')
            if text:
                evs += self._open_text()
                self.text_item['text'] += text
                evs.append(self._ev('response.output_text.delta', item_id=self.text_item['id'],
                                    output_index=self.text_item['index'], content_index=0, delta=text))
            for tc in delta.get('tool_calls') or []:
                idx = tc.get('index', 0)
                fn = tc.get('function') or {}
                c = self.calls.get(idx)
                if c is None:
                    evs += self._close_text()
                    c = {'id': _id('fc'), 'index': self.next_index, 'call_id': tc.get('id') or _id('call'),
                         'name': fn.get('name') or '', 'args': ''}
                    self.next_index += 1
                    self.calls[idx] = c
                    item = _call_item(self.ctx, c['call_id'], c['name'], '', c['id'], 'in_progress')
                    if item['type'] == 'function_call':
                        item['arguments'] = ''
                    evs.append(self._ev('response.output_item.added', output_index=c['index'], item=item))
                elif fn.get('name') and not c['name']:
                    c['name'] = fn['name']
                if fn.get('arguments'):
                    c['args'] += fn['arguments']
                    if c['name'] not in self.ctx['custom']:
                        evs.append(self._ev('response.function_call_arguments.delta', item_id=c['id'],
                                            output_index=c['index'], delta=fn['arguments']))
        return evs

    def finish(self):
        evs = self._close_text()
        for c in sorted(self.calls.values(), key=lambda x: x['index']):
            item = _call_item(self.ctx, c['call_id'], c['name'], c['args'] or '{}', c['id'])
            if item['type'] == 'function_call':
                evs.append(self._ev('response.function_call_arguments.done', item_id=c['id'],
                                    output_index=c['index'], arguments=item['arguments']))
            evs.append(self._ev('response.output_item.done', output_index=c['index'], item=item))
            self.output.append((c['index'], item))
        output = [it for _, it in sorted(self.output, key=lambda x: x[0])]
        r = _response(self.rid, self.ctx, 'completed', output, _usage(self.usage), self.routed)
        evs.append(self._ev('response.completed', response=r))
        return evs

    def fail(self, message):
        r = _response(self.rid, self.ctx, 'failed', [it for _, it in sorted(self.output, key=lambda x: x[0])],
                      routed=self.routed)
        r['error'] = {'code': 'server_error', 'message': message}
        return [self._ev('response.failed', response=r)]
