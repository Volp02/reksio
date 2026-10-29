from __future__ import annotations
import queue
 
_waiting = {}
 
def request(req_id, send, timeout=10):
    q = _waiting[req_id] = queue.Queue()
    try:
        send()
        return q.get(timeout=timeout)
    finally:
        _waiting.pop(req_id, None)
 
def resolve(req_id, reply):
    q = _waiting.get(req_id)
    if q is not None:
        q.put(reply)
 
