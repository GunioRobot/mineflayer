
mf.include("chat_commands.js");
mf.include("items.js");
mf.include("player_tracker.js");
mf.include("inventory.js");
mf.include("navigator.js");
mf.include("Set.js");
mf.include("ray_tracer.js");
mf.include("builder.js");

(function() {
    var current_instructor_id;
    var current_block;
    var current_responder_func;
    var current_start;
    var current_end;
    var current_cursor;
    var cursor_traversal_order;
    chat_commands.registerCommand("fill", function(speaker, args, responder_func) {
        chat_commands.talkToSelf("stop");
        var block = items.findBlockTypeUnambiguously(args.join(" "), responder_func);
        var speaker_entity = player_tracker.entityForPlayer(speaker);
        if (speaker_entity === undefined) {
            responder_func("sorry, can't see you");
            return;
        }
        if (block === undefined) {
            return;
        }
        current_instructor_id = speaker_entity.entity_id;
        current_block = block;
        current_responder_func = responder_func;
        responder_func("punch the start block");
    }, 1, Infinity);
    mf.onAnimation(function(entity, animation_type) {
        if (entity.entity_id !== current_instructor_id) {
            return;
        }
        if (animation_type !== mf.AnimationType.SwingArm) {
            return;
        }

        var target_block_position = ray_tracer.find_physical_from_player(entity);
        if (target_block_position === undefined) {
            current_responder_func("you didn't punch anything physical");
            return;
        }

        if (current_start === undefined) {
            // now we know the start
            current_start = target_block_position;
            current_responder_func("now punch the opposite corner");
            return;
        }
        // now we know the end
        current_end = target_block_position;
        // make the start be the min and the end be the max
        function swap(property_name) {
            var tmp = current_start[property_name];
            current_start[property_name] = current_end[property_name];
            current_end[property_name] = tmp;
        }
        if (current_start.x > current_end.x) {
            swap("x");
        }
        if (current_start.y > current_end.y) {
            swap("y");
        }
        if (current_start.z > current_end.z) {
            swap("z");
        }
        // include both ends
        current_end = current_end.offset(1, 1, 1);
        var volume = current_end.minus(current_start);

        // how much space do we need to fill
        var estimate_of_need = 0;
        for (x = current_start.x; x < current_end.x; x++) {
            for (y = current_start.y; y < current_end.y; y++) {
                for (z = current_start.z; z < current_end.z; z++) {
                    if (mf.blockAt(new mf.Point(x, y, z)).type === mf.ItemType.Air) {
                        estimate_of_need++;
                    }
                }
            }
        }
        var total_volume = (volume.x * volume.y * volume.z);
        current_responder_func("will fill a volume of " + volume.x + "x" + volume.y + "x" + volume.z + "=" + estimate_of_need + "/" + total_volume + " with " + current_block.name);
        current_instructor_id = undefined; // don't need any more instructions
        var supply = inventory.itemCount(current_block.id);
        if (supply < estimate_of_need) {
            current_responder_func("I'm going to need " + (estimate_of_need - supply) + " more " + current_block.name);
        }

        // determine the best x,y,z traversal order
        cursor_traversal_order = ["x", "y", "z"];
        cursor_traversal_order.sort(function(left, right) {
            return volume[left] - volume[right];
        });
        current_cursor = current_start.clone();
        // pull back the first so that our loop includes it
        current_cursor[cursor_traversal_order[0]]--;

        nextBlock();
    });

    var impossible_count = 0;
    function nextBlock() {
        while (true) {
            current_cursor[cursor_traversal_order[0]]++;
            if (current_cursor[cursor_traversal_order[0]] >= current_end[cursor_traversal_order[0]]) {
                current_cursor[cursor_traversal_order[0]] = current_start[cursor_traversal_order[0]];
                current_cursor[cursor_traversal_order[1]]++;
                if (current_cursor[cursor_traversal_order[1]] >= current_end[cursor_traversal_order[1]]) {
                    current_cursor[cursor_traversal_order[1]] = current_start[cursor_traversal_order[1]];
                    current_cursor[cursor_traversal_order[2]]++;
                    if (current_cursor[cursor_traversal_order[2]] >= current_end[cursor_traversal_order[2]]) {
                        // done
                        if (impossible_count === 0) {
                            current_responder_func("done");
                        } else {
                            current_responder_func("couldn't place " + impossible_count + " spaces");
                        }
                        stop();
                        return;
                    }
                }
            }
            if (mf.blockAt(current_cursor).type === mf.ItemType.Air) {
                // found a spot
                break;
            }
        }
        navigator.navigateTo(current_cursor, {
            "end_radius": 4,
            "arrived_func": function() {
                placeAt(current_cursor);
            },
            "cant_find_func": function() {
                if (current_end === undefined) {
                    return;
                }
                impossible_count++;
                nextBlock();
            },
        });
    }
    function placeAt(point) {
        if (!inventory.equipItem(current_block.id, function() {
            if (current_end === undefined) {
                return;
            }
            if (!builder.placeEquippedBlock(point)) {
                impossible_count++;
            }
            nextBlock();
        })) {
            current_responder_func("out of " + current_block.name);
            stop();
        }
    }

    function stop() {
        current_instructor_id = undefined;
        current_start = undefined;
        current_end = undefined;
        impossible_count = 0;
    }
    chat_commands.registerCommand("stop", stop);
})();

