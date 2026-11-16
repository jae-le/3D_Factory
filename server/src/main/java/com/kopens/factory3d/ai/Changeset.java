package com.kopens.factory3d.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** 한 대화의 아직 적용 안 한 변경 제안 묶음. 대상(targetKey)마다 항목 하나, seq 순. 대화 잠금(ProposalStore) 안에서만 바뀜 */
public final class Changeset {
    public record Item(int seq, String kind, String target, String targetKey, JsonNode before, JsonNode after, String label) {}

    public record View(String id, List<Item> items) {}

    public record Snapshot(List<Item> items, int nextSeq) {}

    private final String id = UUID.randomUUID().toString();
    private final List<Item> items = new ArrayList<>();
    private int nextSeq = 1;
    private int version;

    public String id() {
        return id;
    }

    public List<Item> items() {
        return List.copyOf(items);
    }

    public boolean isEmpty() {
        return items.isEmpty();
    }

    public int version() {
        return version;
    }

    public int nextSeq() {
        return nextSeq;
    }

    public Optional<Item> find(String targetKey) {
        return items.stream().filter(i -> i.targetKey().equals(targetKey)).findFirst();
    }

    public Item add(String kind, String target, String targetKey, JsonNode before, JsonNode after, String label) {
        Item it = new Item(nextSeq++, kind, target, targetKey, before, after, label);
        items.add(it);
        version++;
        return it;
    }

    public Item replace(Item old, String kind, String target, JsonNode before, JsonNode after, String label) {
        Item it = new Item(old.seq(), kind, target, old.targetKey(), before, after, label);
        items.set(items.indexOf(old), it);
        version++;
        return it;
    }

    public void remove(Item old) {
        if (items.remove(old)) version++;
    }

    public Snapshot snapshot() {
        return new Snapshot(List.copyOf(items), nextSeq);
    }

    public void restore(Snapshot s) {
        items.clear();
        items.addAll(s.items());
        nextSeq = s.nextSeq();
        version++;
    }

    public View view() {
        return new View(id, items());
    }
}
